'use strict';
const C=require('./content'),E=require('./engine'),K=require('./core'),DB=require('./db'),Room=require('./classroom');
const {zipSync,strToU8,unzipSync,strFromU8}=require('fflate');
const {httpError}=require('./util');
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const x=s=>esc(s).replace(/"/g,'&quot;');
function documentFor(st,lesson,records,reflection,settings,extras){
 extras=extras||{rows:[],events:[],messages:[],requests:[],supplements:[]};
 const lines=['PQ4R 학습 기록 · '+lesson+'차시','학생 코드: '+st.code];
 for(const stage of C.STAGES){
  lines.push('['+stage.id+']');
  for(const it of C.ITEMS.filter(it=>it.lesson===lesson&&it.stage===stage.id&&!it.archived)){
   lines.push(it.id+' '+it.title);
   const versions=records[it.id]||[];
   if(!versions.length){lines.push('제출 기록 없음');continue;}
   versions.forEach((v,i)=>{
    lines.push(i===0?'최초 답변':'수정 답변 '+i);
    for(const f of (E.resolveItem(it.id,st.grp,settings)?.fields||[]))lines.push(f.label+': '+String(v.fields&&v.fields[f.key]||'(미작성)'));
    if(i)lines.push('수정 이유: '+(v.reason||'(기록 없음)'));
   });
  }
 }
 for(const row of extras.rows){if(row.draft&&Object.keys(row.draft).length)lines.push('[마지막 임시저장] '+row.item_id+' : '+JSON.stringify(row.draft));if(row.question_draft)lines.push('[작성 중 질문] '+row.item_id+' : '+row.question_draft);}
 for(const m of extras.messages)lines.push('[AI 및 교사 발문] '+new Date(m.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' '+m.item_id+' '+m.sender+' : '+m.text);
 for(const q of extras.requests)lines.push('[도움 요청] '+q.item_id+' : '+(q.question_text||'내용 없음')+' / '+(q.answered_at?'처리됨':'미처리'));
 for(const z of extras.supplements)lines.push('[보완 답안] '+z.item_id+' : '+JSON.stringify(z.fields));
 lines.push('[학생 전체 활동 기록: 서버에 저장된 이벤트만 포함]');
 for(const e of extras.events){const d=e.data||{};lines.push(new Date(e.server_ts).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' / '+e.event_type+' / '+(e.item_id||'')+(d.response_raw?' / 답안: '+String(d.response_raw):'')+(d.revision_reason_raw?' / 수정 이유: '+d.revision_reason_raw:'')+(d.support_text?' / 발문: '+d.support_text:'')+(e.event_type==='REVIEW_POST_REFLECTION'?' / 성찰: '+String(d.response_raw||''):'') );}
 lines.push('참고: 서버에 전송되지 않은 학생 기기 임시 입력은 포함되지 않습니다.');
 if(reflection){lines.push('[Review 성찰]');lines.push('이해 정도: '+(reflection.understanding||''));lines.push('내 풀이와 해설 비교: '+(reflection.comparison||''));}
 const xml='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+lines.map(t=>'<w:p><w:r><w:t xml:space="preserve">'+x(t)+'</w:t></w:r></w:p>').join('')+'<w:sectPr/></w:body></w:document>';
 return Buffer.from(zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8(xml)},{level:0}));
}
function allowed(s){return s.status!=='open'||(s.clock||{}).mode==='finished';}
async function record(sql,s,st){
 const rows=await sql`select item_id,versions,draft,question_draft from item_states where session_id=${s.id} and student_id=${st.id} order by item_id`;
 const ev=await sql`select event_type,item_id,server_ts,data from events where session_id=${s.id} and student_code=${st.code} order by seq`;
 const messages=await sql`select item_id,sender,text,at from messages where session_id=${s.id} and student_id=${st.id} order by seq`;
 const requests=await sql`select item_id,question_text,answered_at from help_requests where session_id=${s.id} and student_id=${st.id} order by requested_at`;
 const supplements=await sql`select item_id,fields from supplements where session_id=${s.id} and student_id=${st.id} order by item_id`;
 const e=ev.filter(x=>x.event_type==='REVIEW_POST_REFLECTION').slice(-1)[0];let reflection=null;try{reflection=e?JSON.parse(e.data.response_raw||'{}'):null;}catch(_){}
 return documentFor(st,Number(s.lesson),Object.fromEntries(rows.map(x=>[x.item_id,x.versions||[]])),reflection,K.settingsOf(s),{rows,events:ev,messages,requests,supplements});
}
async function mine(tok){const sql=DB.db(),[s]=await sql`select * from sessions where id=${tok.ses}`,[st]=await sql`select id,code,grp from students where id=${tok.sub} and active=true`;if(!s||!st)throw httpError(403,'허용되지 않습니다.','forbidden');if(!allowed(s))throw httpError(409,'수업 종료 후 다운로드 가능합니다.','not_finished');const [p]=await sql`select student_id from participants where session_id=${s.id} and student_id=${st.id}`;if(!p)throw httpError(403,'해당 수업 학생이 아닙니다.','forbidden');return {filename:'PQ4R_'+st.code+'.docx',base64:(await record(sql,s,st)).toString('base64')};}
async function all(tok,q){const s=await Room.access(tok,q.session);if(!allowed(s))throw httpError(409,'수업 종료 후 다운로드 가능합니다.','not_finished');const sql=DB.db(),rows=await sql`select st.id,st.code,st.grp from participants p join students st on st.id=p.student_id where p.session_id=${s.id} order by st.code`;if(!rows.length)throw httpError(404,'참여 학생이 없습니다.','no_students');const files={};for(const st of rows)files['PQ4R_'+st.code+'.docx']=new Uint8Array(await record(sql,s,st));return {filename:'PQ4R_'+s.code+'_전체학생.zip',mime:'application/zip',base64:Buffer.from(zipSync(files,{level:0})).toString('base64'),count:rows.length};}

function printable(buf){
 const xml=strFromU8(unzipSync(new Uint8Array(buf))['word/document.xml']);
 const decode=t=>t.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 return Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g),m=>'<p>'+Array.from(m[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g),n=>esc(decode(n[1]))).join('')+'</p>').join('');
}
function printHtml(parts){return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>PQ4R 학생 기록 PDF 저장</title><style>body{font-family:Arial,"Malgun Gothic",sans-serif;color:#182132;line-height:1.55;margin:22mm}h1{font-size:20pt}p{font-size:10pt;white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0}.student{break-after:page;page-break-after:always}.student:last-child{break-after:auto;page-break-after:auto}.bar{display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid #ccd3e0;margin-bottom:18px}@media print{.bar{display:none}@page{size:A4;margin:17mm}}</style></head><body><div class="bar"><strong>인쇄 창에서 대상: PDF로 저장을 선택하세요.</strong><button onclick="window.print()">PDF로 저장</button></div>'+parts.map(p=>'<section class="student">'+p+'</section>').join('')+'</body></html>';}
async function minePdf(tok){const sql=DB.db(),[s]=await sql`select * from sessions where id=\${tok.ses}`,[st]=await sql`select id,code,grp from students where id=\${tok.sub} and active=true`;if(!s||!st)throw httpError(403,'허용되지 않습니다.','forbidden');if(!allowed(s))throw httpError(409,'수업 종료 후 이용할 수 있습니다.','not_finished');const [p]=await sql`select student_id from participants where session_id=\${s.id} and student_id=\${st.id}`;if(!p)throw httpError(403,'해당 수업 학생이 아닙니다.','forbidden');return {html:printHtml([printable(await record(sql,s,st))])};}
async function allPdf(tok,q){const s=await Room.access(tok,q.session);if(!allowed(s))throw httpError(409,'수업 종료 후 이용할 수 있습니다.','not_finished');const sql=DB.db(),students=await sql`select st.id,st.code,st.grp from participants p join students st on st.id=p.student_id where p.session_id=\${s.id} order by st.code`;if(!students.length)throw httpError(404,'참여 학생이 없습니다.','no_students');const parts=[];for(const st of students)parts.push(printable(await record(sql,s,st)));return {html:printHtml(parts),count:students.length};}

module.exports={mine,all,minePdf,allPdf};