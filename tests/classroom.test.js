/* 새 반 관리와 자동 수업 API 통합 검증. 격리 DB 및 로컬 서버에서만 실행. */
'use strict';
const assert=require('node:assert/strict');
const BASE=process.env.TEST_BASE||'http://127.0.0.1:3200';
const {db}=require('../lib/db');
let assertions=0;
function check(v,msg){assert.ok(v,msg);assertions++;if(process.env.TEST_TRACE)console.log('OK',msg);}
async function call(method,path,body,tok){const r=await fetch(BASE+'/api/v1/'+path,{method,headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function main(){
 const sql=db();
 let r=await call('POST','login/staff',{role:'researcher',password:process.env.RESEARCHER_PASSWORD});check(r.status===200,'연구자 로그인');const rt=r.body.token;
 r=await call('POST','login/staff',{role:'teacher',teacher_id:'T1',password:process.env.TEACHER_PASSWORD});const tt=r.body.token;check(!!tt,'T1 로그인');
 r=await call('POST','login/staff',{role:'teacher',teacher_id:'T2',password:process.env.TEACHER_PASSWORD});const other=r.body.token;
 const suffix=Date.now().toString(36).slice(-5).toUpperCase(),cls='TEST'+suffix,exp='TESTE'+suffix;
 for(const [code,group] of [[cls,'CONTROL'],[exp,'EXPERIMENT']]){r=await call('POST','admin/class',{code,group,teacher_code:'T1'},rt);check(r.status===200,'반 생성 '+group);}
 r=await call('POST','admin/class',{code:cls,group:'EXPERIMENT',teacher_code:'T1'},rt);check(r.status===409,'기존 집단 변경 차단');
 const csv='code,pin\n'+Array.from({length:30},(_,i)=>cls+'S'+String(i+1).padStart(2,'0')+',1111').join('\n');
 r=await call('POST','admin/class-roster',{class_code:cls,csv},rt);check(r.body.created===30&&r.body.errors.length===0,'30명 두 열 명단 등록');
 const codes=Array.from({length:30},(_,i)=>cls+'S'+String(i+1).padStart(2,'0'));
 r=await call('POST','admin/class-roster',{class_code:exp,code:exp+'S1',pin:'1111'},rt);check(r.body.created===1,'실험 학생 개별 등록');
 r=await call('POST','admin/class-roster',{class_code:exp,code:codes[0],pin:'1111'},rt);check(r.body.errors.length===1,'타반 중복 코드 이동 방지');
 r=await call('POST','admin/class-roster',{class_code:cls,csv:'code,pin\nBAD,abc\nDUP,1111\nDUP,2222'},rt);check(r.body.errors.length===2,'잘못된 PIN 및 중복 코드 검증');
 const sess=cls+'-L1',esess=exp+'-L1';
 for(const [code,class_name] of [[sess,cls],[esess,exp]]){r=await call('POST','admin/session',{code,class_name,lesson:1,settings:{autoTimer:true,videoUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}},rt);check(r.body.session.settings.autoTimer,'자동 수업 생성');}
 r=await call('GET','staff/sessions',undefined,other);check(!r.body.sessions.some(s=>s.class_name===cls),'미배정 반 목록 숨김');
 r=await call('GET','staff/overview?session='+sess,undefined,other);check(r.status===403,'미배정 교사 접근 차단');
 r=await call('GET','staff/overview?session='+sess,undefined,tt);check(r.body.students.length===31,'미접속 포함 전체 등록 학생 현황');
 check(!JSON.stringify(r.body).includes('pin'),'교사에게 PIN 미노출');
 const toks=await Promise.all(codes.map(async code=>{const x=await call('POST','login/student',{session_code:sess,student_code:code,pin:'1111'});check(x.status===200,'학생 PIN1111 입장 '+code);return x.body.token;}));
 r=await call('POST','me/draft',{item_id:'L1PV01',draft:{text:'시작 전 답'}},toks[0]);check(r.body.saved===false,'시작 대기 중 작성 차단');
 r=await call('POST','staff/clock',{session:sess,action:'start'},tt);check(r.status===200&&r.body.session.clock.mode==='running','수업 시작');
 r=await call('POST','staff/stage',{session:sess,stage:1},tt);check(r.status===409,'자동 수업 수동 단계 변경 방지');
 const [se]=await sql`select * from sessions where code=${sess}`;
 r=await call('POST','me/draft',{item_id:'L1PV01',draft:{text:'시간 안 원본'}},toks[0]);check(r.body.saved,'시간 내 임시저장');
 // 30명 동시 제출. 두 집단 공통 지원 조건 보존.
 const submissions=await Promise.all(toks.map(tok=>call('POST','me/submit',{item_id:'L1PV01',fields:{text:'삼각형이 두 개 있어요'}},tok)));check(submissions.every(x=>x.status===200),'30명 동시 제출 성공');
 const helps=await Promise.all(toks.slice(0,3).map(tok=>call('POST','me/help',{item_id:'L1PV01'},tok)));check(helps.every(x=>x.status===200),'교사 도움 요청');
 r=await call('GET','staff/overview?session='+sess,undefined,tt);check(r.body.requests.length===3,'도움 요청과 제출 원문 수집');
 const targets=r.body.requests.map(q=>({code:q.code,request_id:q.id,attempt:q.attempt}));
 const bank=await call('GET','staff/content',undefined,tt),bid=bank.body.bank.find(b=>b.item==='L1PV01').id;
 r=await call('POST','staff/send-batch',{session:sess,item_id:'L1PV01',bank_id:bid,targets},tt);check(r.body.results.every(x=>x.ok),'3명 일괄 발문 개별 전달');
 r=await call('POST','staff/send-batch',{session:sess,item_id:'L1PV01',bank_id:bid,targets},tt);check(r.body.results.every(x=>!x.ok),'재시도 중복 전송 방지');
 const [messages]=await sql`select count(*)::int as n from messages where session_id=${se.id} and sender='TEACHER'`;check(messages.n===3,'지원 메시지 중복 없음');
 r=await call('POST','staff/clock',{session:sess,action:'pause'},tt);check(r.body.session.clock.mode==='paused','긴급 정지');
 r=await call('POST','me/draft',{item_id:'L1PV01',draft:{text:'정지 중 변경'}},toks[0]);check(!r.body.saved,'정지 중 원본 변경 차단');
 r=await call('POST','staff/clock',{session:sess,action:'resume'},tt);check(r.body.session.clock.mode==='running','타이머 재개');
 r=await call('POST','staff/announce',{session:sess,key:'time'},tt);check(r.status===200,'정해진 시간 안내 전체 전송');
 r=await call('GET','me/sync?seq=0',undefined,toks[0]);check(r.body.notice&&r.body.notice.text.includes('남은 시간'),'학생 시간 안내 수신');
 r=await call('POST','staff/announce',{session:sess,text:'정답을 알려줄게'},tt);check(r.status===400,'자유 수학 안내 우회 차단');
 await sql`update sessions set clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()-1000).toISOString()}::text) where id=${se.id}`;
 const syncs=await Promise.all(toks.map(tok=>call('GET','me/sync?seq=0',undefined,tok)));check(syncs.every(x=>x.body.stage===1),'30명 같은 단계 자동 전환');
 const [opened]=await sql`select count(*)::int as n from events where session_id=${se.id} and event_type='STAGE_OPEN' and data->>'transition_reason'='AUTO_TIMER'`;check(opened.n===1,'동시 폴링에도 전환 이벤트 한 번');
 r=await call('POST','me/draft',{item_id:'L1PV01',draft:{text:'시간 이후 변경'}},toks[0]);check(!r.body.saved,'이전 단계 답안 변경 방지');
 // Review까지 자연스러운 deadline 누적 이동: 현재 단계부터 58분 과거로 이동.
 await sql`update sessions set clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()-58*60000).toISOString()}::text) where id=${se.id}`;
 r=await call('GET','me',undefined,toks[0]);check(r.body.session.clock.mode==='catchup','전체 수업 종료 후 보완 자동 시작');
 r=await call('GET','me/supplements',undefined,toks[0]);check(r.status===200&&r.body.items.length>0,'미완료 문항 모아보기');
 const item=r.body.items[0].item_id;
 const [before]=await sql`select draft,versions from item_states where session_id=${se.id} and student_id=(select id from students where code=${codes[0]}) and item_id=${item}`;
 r=await call('POST','me/supplement',{item_id:item,fields:{text:'보완으로 적은 답'}},toks[0]);check(r.body.ok,'보완본 저장');
 const [after]=await sql`select draft,versions from item_states where session_id=${se.id} and student_id=(select id from students where code=${codes[0]}) and item_id=${item}`;check(JSON.stringify(before)===JSON.stringify(after),'보완 저장이 원본을 덮어쓰지 않음');
 r=await call('POST','me/help',{item_id:'L1RV01'},toks[0]);check(r.status===409,'보완 중 수학 지원 차단');
 await sql`update sessions set clock=jsonb_build_object('mode','catchup','deadline',${new Date(Date.now()-1000).toISOString()}::text) where id=${se.id}`;
 r=await call('GET','me',undefined,toks[0]);check(r.body.session.clock.mode==='finished','5분 종료 자동 마감');
 r=await call('POST','me/supplement',{item_id:item,fields:{text:'시간 초과 수정'}},toks[0]);check(r.status===409,'보완 마감 후 저장 차단');
 r=await call('POST','login/student',{session_code:esess,student_code:exp+'S1',pin:'1111'});const et=r.body.token;
 await call('POST','staff/clock',{session:esess,action:'start'},tt);
 await call('POST','me/submit',{item_id:'L1PV01',fields:{text:'두 삼각형이 있어요'}},et);
 r=await call('POST','staff/send',{session:esess,code:exp+'S1',item_id:'L1PV01',level:1,bank_id:bid},tt);check(r.status===403,'실험집단 교사 수학 발문 차단');
 const [ese]=await sql`select id from sessions where code=${esess}`;
 await sql`update sessions set stage=5,stage_opened=jsonb_build_object('5',${new Date(Date.now()-601000).toISOString()}::text),clock=jsonb_build_object('mode','running','deadline',${new Date(Date.now()+119000).toISOString()}::text) where id=${ese.id}`;
 r=await call('GET','me/review-feedback',undefined,et);check(r.status===200,'해설 공개');
 r=await call('POST','me/review-reflection',{understanding:'partial',comparison:'대응하는 부분을 확인해야 함'},et);check(r.status===200&&r.body.saved.focus_item==='','문제 선택 없는 간단 성찰 저장');
 const [cnt]=await sql`select count(*)::int as n from events where event_type='MAIN_TIME_SNAPSHOT' and session_id=${se.id}`;check(cnt.n===30,'전체 학생 시간 내 스냅샷 보존');
 let appendOnly=false;try{await sql`update events set event_type='X' where session_id=${se.id}`;}catch(e){appendOnly=true;}check(appendOnly,'연구 로그 수정 방지 유지');
 console.log('PASS '+assertions+': 반 등록, 배정 권한, 30명 동시 제출, 일괄 전송, 타이머, 보완, 성찰');
 return {rt,tt,toks,cls,exp,sess,esess,codes};
}
module.exports={main,call};
if(require.main===module)main().then(()=>db().end()).catch(e=>{console.error(e);process.exit(1);});
