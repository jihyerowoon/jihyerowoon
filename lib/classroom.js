'use strict';
const K=require('./core'), C=require('./content'), E=require('./engine'), EV=require('./events'), T=require('./staff'), Clock=require('./clock');
const {db}=require('./db');
const {httpError,str}=require('./util');
async function classes() {
  const sql=db();
  return {classes:await sql`select c.*, (select count(*)::int from students s where s.class_name=c.code) as count from classes c order by c.code`};
}
async function saveClass(tok,body) {
  const code=K.normCode(body.code), teacher=K.normCode(body.teacher_code||'T1'), grp=body.group;
  if(!K.CODE_RE.test(code)||!K.CODE_RE.test(teacher)||!['CONTROL','EXPERIMENT'].includes(grp)) throw httpError(400,'반 코드와 교사 코드, 집단을 확인해 주세요.','bad_class');
  const sql=db();
  await sql.begin(async tx=>{
    await tx`select pg_advisory_xact_lock(hashtext(${'class:'+code}))`;
    const [ex]=await tx`select * from classes where code=${code}`;
    if(ex && ex.grp!==grp) throw httpError(409,'기존 반의 집단은 바꿀 수 없습니다. 새 반을 만들어 주세요.','class_group_locked');
    const [mixed]=await tx`select code from students where class_name=${code} and grp<>${grp} limit 1`;
    if(mixed) throw httpError(409,'기존 명단에 다른 집단 학생이 있습니다. 반 코드를 확인해 주세요.','mixed_class');
    await tx`insert into classes(code,grp,teacher_code) values(${code},${grp},${teacher}) on conflict(code) do update set teacher_code=excluded.teacher_code`;
    await EV.insert(tx,null,[EV.make('SETTINGS_CHANGE',{writer:'RESEARCHER',teacherId:tok.tid},{transition_reason:'CLASS_SAVED',extra:{code,group:grp,teacher_code:teacher}})]);
  });
  return classes();
}
async function access(tok,code) {
  const sql=db();const [s]=await sql`select * from sessions where code=${K.normCode(code)}`;
  if(!s)throw httpError(404,'수업 코드를 찾을 수 없어요.','no_session');
  if(tok.role==='teacher') {
    const [c]=await sql`select teacher_code from classes where code=${s.class_name}`;
    if(c && c.teacher_code!==tok.tid)throw httpError(403,'이 반에 배정된 교사 코드로 입장해 주세요.','teacher_not_assigned');
  }
  return Clock.sync(sql,s.id);
}
async function sessions(tok) {
  const sql=db();const r=await T.sessions();
  const {classes:cs}=await classes();
  r.sessions=r.sessions.filter(s=>tok.role==='researcher'||!cs.some(c=>c.code===s.class_name)||cs.some(c=>c.code===s.class_name&&c.teacher_code===tok.tid));
  // Timer is reconciled on overview/student sync; listing remains inexpensive.
  return r;
}
async function roster(tok,body) {
  const sql=db();const [c]=await sql`select * from classes where code=${K.normCode(body.class_code)}`;
  if(!c)throw httpError(404,'먼저 반을 저장해 주세요.','no_class');
  const rows=body.code?[[body.code,body.pin||'']]:T.parseCSV(body.csv);
  if(rows.length && /^(학생\s*코드|code|student_code)$/i.test(rows[0][0]))rows.shift();
  if(!rows.length||rows.length>2000)throw httpError(400,'학생 명단은 1명부터 2,000명까지 등록할 수 있어요.','bad_roster');
  const errors=[],safe=[],seen=new Set();
  for(let i=0;i<rows.length;i++){
    const r=rows[i],code=K.normCode(r[0]),pin=String(r[1]||'').trim();
    if(r.length>2||!K.CODE_RE.test(code)||(pin&&!/^\d{4,8}$/.test(pin))||seen.has(code)){errors.push({line:i+1,code,error:'학생 코드와 숫자 PIN 두 열을 확인해 주세요. 중복 코드는 사용할 수 없어요.'});continue;}
    seen.add(code);
    const [ex]=await sql`select class_name,grp from students where code=${code}`;
    if(ex&&(ex.class_name!==c.code||ex.grp!==c.grp)){errors.push({line:i+1,code,error:'다른 반에 등록된 학생 코드입니다. 기존 명단은 변경하지 않았어요.'});continue;}
    safe.push([code,c.grp,c.code,pin].join(','));
  }
  const out=safe.length?await T.roster(tok,{csv:'code,group,class,pin\n'+safe.join('\n')}):{created:0,updated:0,unchanged:0,pins:[],errors:[]};
  out.errors=errors.concat(out.errors);return out;
}
async function overview(tok,q) {
  const s=await access(tok,q.session),sql=db();
  const out=await T.overview({...q,fp:null});
  const [cls]=await sql`select grp,teacher_code from classes where code=${s.class_name}`;
  out.group=cls?cls.grp:null;
  const registered=s.class_name?await sql`select st.code,st.grp,p.last_seen from students st left join participants p on p.student_id=st.id and p.session_id=${s.id} where st.class_name=${s.class_name} and st.active order by st.code`:[];
  registered.forEach(st=>{if(!out.students.some(p=>p.code===st.code))out.students.push({code:st.code,group:st.grp,last_seen:null,items:{}});});
  out.students.sort((a,b)=>a.code.localeCompare(b.code));
  const reqs=await sql`select r.id,st.code,r.item_id,r.stage,r.requested_at,i.versions,i.rec from help_requests r join students st on st.id=r.student_id left join item_states i on i.session_id=r.session_id and i.student_id=r.student_id and i.item_id=r.item_id where r.session_id=${s.id} and r.answered_at is null order by r.requested_at`;
  out.requests=reqs.filter(r=>K.stageIndexOfItem(r.item_id)===s.stage).map(r=>({id:r.id,code:r.code,item_id:r.item_id,stage:r.stage,at:r.requested_at.toISOString(),fields:r.versions&&r.versions.length?r.versions[r.versions.length-1].fields:{},attempt:r.rec?r.rec.attempts:0}));
  return out;
}
async function batchSend(tok,body) {
  await access(tok,body.session);
  const targets=Array.isArray(body.targets)?body.targets:[];
  if(!targets.length||targets.length>30||new Set(targets.map(x=>x.request_id)).size!==targets.length)throw httpError(400,'도움 요청을 1개부터 30개까지 중복 없이 선택해 주세요.','bad_targets');
  const results=[];
  for(const t of targets){try{
    await T.send(tok,{session:body.session,code:t.code,item_id:body.item_id,level:1,bank_id:body.bank_id,request_id:t.request_id,expected_attempt:t.attempt,mode:'bank'});
    results.push({code:t.code,ok:true});
  }catch(e){results.push({code:t.code,ok:false,error:e.status?e.message:'전송하지 못했습니다. 다시 확인해 주세요.'});}}
  return {results};
}
async function clock(tok,body){const s=await access(tok,body.session);return {session:K.staffSession(await Clock.control(db(),s,body.action,tok)),server_time:new Date().toISOString()};}
async function announce(tok,body){const s=await access(tok,body.session),text=({time:'남은 시간을 확인해 주세요. 시간이 끝나면 자동으로 다음 단계로 이동합니다.',save:'작성한 답을 제출해 주세요. 시간이 끝나면 다 쓰지 않아도 다음 단계로 이동합니다.',device:'접속이나 기기에 문제가 있으면 선생님께 알려 주세요.'})[body.key];if(!text)throw httpError(400,'안내 문장을 입력해 주세요.','empty');const sql=db();await sql.begin(async tx=>{await EV.insert(tx,s.id,[EV.make('CLASS_NOTICE',{session:s,writer:tok.role.toUpperCase(),teacherId:tok.tid},{support_provider:'NONE',transition_reason:'WHOLE_CLASS_NOTICE',extra:{text}})]);});return {ok:true};}
module.exports={classes,saveClass,roster,access,sessions,overview,batchSend,clock,announce};
