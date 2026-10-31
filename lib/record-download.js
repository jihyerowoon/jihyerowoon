'use strict';
const C=require('./content'),DB=require('./db'),Room=require('./classroom');
const {zipSync,strToU8}=require('fflate');
const {httpError}=require('./util');
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const x=s=>esc(s).replace(/"/g,'&quot;');
function documentFor(st,lesson,records,reflection){
 const lines=['PQ4R 학습 기록 · '+lesson+'차시','학생 코드: '+st.code];
 for(const stage of C.STAGES){
  lines.push('['+stage.id+']');
  for(const it of C.ITEMS.filter(it=>it.lesson===lesson&&it.stage===stage.id&&!it.archived)){
   lines.push(it.id+' '+it.title);
   const versions=records[it.id]||[];
   if(!versions.length){lines.push('제출 기록 없음');continue;}
   versions.forEach((v,i)=>{
    lines.push(i===0?'최초 답변':'수정 답변 '+i);
    for(const f of it.fields)lines.push(f.label+': '+String(v.fields&&v.fields[f.key]||'(미작성)'));
    if(i)lines.push('수정 이유: '+(v.reason||'(기록 없음)'));
   });
  }
 }
 if(reflection){lines.push('[Review 성찰]');lines.push('이해 정도: '+(reflection.understanding||''));lines.push('내 풀이와 해설 비교: '+(reflection.comparison||''));}
 const xml='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+lines.map(t=>'<w:p><w:r><w:t xml:space="preserve">'+x(t)+'</w:t></w:r></w:p>').join('')+'<w:sectPr/></w:body></w:document>';
 return Buffer.from(zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8(xml)},{level:0}));
}
function allowed(s){return s.status!=='open'||(s.clock||{}).mode==='finished';}
async function record(sql,s,st){const rows=await sql`select item_id,versions from item_states where session_id=${s.id} and student_id=${st.id}`;const [e]=await sql`select data from events where session_id=${s.id} and student_code=${st.code} and event_type='REVIEW_POST_REFLECTION' order by seq desc limit 1`;let reflection=null;try{reflection=e?JSON.parse(e.data.response_raw||'{}'):null;}catch(_){}return documentFor(st,Number(s.lesson),Object.fromEntries(rows.map(r=>[r.item_id,r.versions||[]])),reflection);}
async function mine(tok){const sql=DB.db(),[s]=await sql`select * from sessions where id=${tok.ses}`,[st]=await sql`select id,code from students where id=${tok.sub} and active=true`;if(!s||!st)throw httpError(403,'허용되지 않습니다.','forbidden');if(!allowed(s))throw httpError(409,'수업 종료 후 다운로드 가능합니다.','not_finished');const [p]=await sql`select student_id from participants where session_id=${s.id} and student_id=${st.id}`;if(!p)throw httpError(403,'해당 수업 학생이 아닙니다.','forbidden');return {filename:'PQ4R_'+st.code+'.docx',base64:(await record(sql,s,st)).toString('base64')};}
async function all(tok,q){const s=await Room.access(tok,q.session);if(!allowed(s))throw httpError(409,'수업 종료 후 다운로드 가능합니다.','not_finished');const sql=DB.db(),rows=await sql`select st.id,st.code from participants p join students st on st.id=p.student_id where p.session_id=${s.id} order by st.code`;if(!rows.length)throw httpError(404,'참여 학생이 없습니다.','no_students');const files={};for(const st of rows)files['PQ4R_'+st.code+'.docx']=new Uint8Array(await record(sql,s,st));return {filename:'PQ4R_'+s.code+'_전체학생.zip',mime:'application/zip',base64:Buffer.from(zipSync(files,{level:0})).toString('base64'),count:rows.length};}
module.exports={mine,all};