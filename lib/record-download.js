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
   if(!versions.length){lines.push('제출 기록 없음 (아래 서버 임시저장은 별도 확인)');continue;}
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
 lines.push('[주요 학습 활동 로그]');
 for(const e of extras.events){if(['REVIEW_REFLECTION_DRAFT','STATE_CHANGE','MAIN_TIME_SNAPSHOT','CLOCK_CHANGE','LOGIN'].includes(e.event_type))continue;const d=e.data||{};lines.push(new Date(e.server_ts).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' / '+e.event_type+' / '+(e.item_id||'')+(d.response_raw?' / 답안: '+String(d.response_raw):'')+(d.revision_reason_raw?' / 수정 이유: '+d.revision_reason_raw:'')+(d.support_text?' / 발문: '+d.support_text:'')+(e.event_type==='REVIEW_POST_REFLECTION'?' / 성찰: '+String(d.response_raw||''):'') );}
 lines.push('참고: 서버에 전송되지 않은 학생 기기 임시 입력은 포함되지 않습니다.');
 if(reflection){lines.push('[Review 성찰]');lines.push('이해 정도: '+(reflection.understanding||''));lines.push('내 풀이와 해설 비교: '+(reflection.comparison||''));}
 const xml='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+lines.map(function(t){
  const stage=/^\[(Preview|Question|Read|Reflect|Recite|Review|Review 성찰)\]/.test(t),title=/^PQ4R 학습 기록/.test(t),item=/^L[1-8](PV|QU|RD|RF|RC|RV)\d\d\s/.test(t),sub=/^(최초 답변|수정 답변)/.test(t),meta=/^학생 코드:/.test(t);
  const size=title?32:stage?28:item?24:sub?22:meta?22:20,color=title||stage?'234B80':item?'173A65':sub?'654F8A':'263751';
  const bold=(title||stage||item||sub||meta)?'<w:b/>':'';
  const words=x(t).replace(/\r\n?/g,'\n').replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">');
  return '<w:p><w:pPr><w:spacing w:before="'+(stage?240:item?160:30)+'" w:after="'+(sub?80:130)+'"/><w:keepNext w:val="'+(stage||item?1:0)+'"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="Malgun Gothic"/><w:sz w:val="'+size+'"/><w:color w:val="'+color+'"/>'+bold+'</w:rPr><w:t xml:space="preserve">'+words+'</w:t></w:r></w:p>';
 }).join('')+'<w:sectPr/></w:body></w:document>';
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
async function limitedMap(items,limit,fn){const out=new Array(items.length);let next=0;const run=async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}};await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>run()));return out;}
async function all(tok,q){const s=await Room.access(tok,q.session);if(!allowed(s))throw httpError(409,'수업 종료 후 다운로드 가능합니다.','not_finished');const sql=DB.db(),rows=await sql`select st.id,st.code,st.grp from participants p join students st on st.id=p.student_id where p.session_id=${s.id} order by st.code`;if(!rows.length)throw httpError(404,'참여 학생이 없습니다.','no_students');const files={};const data=await limitedMap(rows,4,st=>record(sql,s,st));rows.forEach((st,i)=>{files['PQ4R_'+st.code+'.docx']=new Uint8Array(data[i]);});return {filename:'PQ4R_'+s.code+'_전체학생.zip',mime:'application/zip',base64:Buffer.from(zipSync(files,{level:0})).toString('base64'),count:rows.length};}

function printable(buf){
 const xml=strFromU8(unzipSync(new Uint8Array(buf))['word/document.xml']);
 const decode=t=>t.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const segments=Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g),m=>decode(m[1].replace(/<w:br\s*\/>/g,'\n').replace(/<[^>]+>/g,''))).filter(t=>t.trim());
 return segments.map(t=>{
  const v=esc(t).replace(/\n/g,'<br>');if(/^PQ4R 학습 기록/.test(t))return '<h1>'+v+'</h1>';
  if(/^\[(Preview|Question|Read|Reflect|Recite|Review|Review 성찰|주요 학습 활동 로그)\]/.test(t))return '<h2>'+v+'</h2>';
  if(/^L[1-8](PV|QU|RD|RF|RC|RV)\d\d\s/.test(t))return '<h3>'+v+'</h3>';
  if(/^(최초 답변|수정 답변)/.test(t))return '<h4>'+v+'</h4>';
  if(/^\[마지막 임시저장\]/.test(t))return '<div class="draft">'+v+'</div>';
  if(/^\d{4}.*\/ (FIRST_SUBMIT|RESUBMIT|TIMEOUT|REVIEW_POST_REFLECTION)/.test(t))return '<p class="audit">'+v+'</p>';
  if(/^수정 이유/.test(t))return '<div class="reason">'+v+'</div>';
  return '<p>'+v+'</p>';
 }).join('');
}
function printHtml(parts){return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PQ4R 학생 기록 PDF</title><style>body{font-family:"Malgun Gothic",sans-serif;line-height:1.65;color:#19304e;margin:22mm auto;max-width:800px;padding:0 15px}h1{font-size:26px;color:#193d71;margin:0 0 13px}h2{font-size:20px;color:#17467e;border-bottom:2px solid #bfd1e7;padding:12px 0 8px;margin:26px 0 14px;break-after:avoid}h3{font-size:16px;color:#203c60;margin:18px 0 8px;break-after:avoid}h4{font-size:14px;color:#355c8e;margin:8px 0 5px}p,.reason,.draft{font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0 12px}h4+p{background:#f3f7fc;border:1px solid #dae4f0;border-radius:7px;padding:10px 13px}.draft{background:#eff5fc;padding:8px;border-radius:5px}.reason{border-left:3px solid #9b81a9;padding-left:10px}.audit{font-size:11px;color:#556a84;margin:3px 0}.student{break-after:page}.student:last-child{break-after:auto}.bar{padding:12px;margin-bottom:18px;background:#eaf3ff}.bar button{margin-left:10px;padding:7px 14px}@media print{@page{size:A4;margin:17mm}body{margin:0;padding:0}.bar{display:none}h1,h2,h3,h4{break-after:avoid}} </style></head><body><div class="bar">인쇄 대상에서 PDF로 저장을 선택하세요.<button onclick="window.print()">PDF로 저장</button></div>'+parts.map(p=>'<section class="student">'+p+'</section>').join('')+'</body></html>';}
async function minePdf(tok){const sql=DB.db(),[s]=await sql`select * from sessions where id=${tok.ses}`,[st]=await sql`select id,code,grp from students where id=${tok.sub} and active=true`;if(!s||!st)throw httpError(403,'허용되지 않습니다.','forbidden');if(!allowed(s))throw httpError(409,'수업 종료 후 이용할 수 있습니다.','not_finished');const [p]=await sql`select student_id from participants where session_id=${s.id} and student_id=${st.id}`;if(!p)throw httpError(403,'해당 수업 학생이 아닙니다.','forbidden');return {html:printHtml([printable(await record(sql,s,st))])};}
async function allPdf(tok,q){const s=await Room.access(tok,q.session);if(!allowed(s))throw httpError(409,'수업 종료 후 이용할 수 있습니다.','not_finished');const sql=DB.db(),students=await sql`select st.id,st.code,st.grp from participants p join students st on st.id=p.student_id where p.session_id=${s.id} order by st.code`;if(!students.length)throw httpError(404,'참여 학생이 없습니다.','no_students');const parts=(await limitedMap(students,4,st=>record(sql,s,st))).map(printable);return {html:printHtml(parts),count:students.length};}

module.exports={mine,all,minePdf,allPdf};