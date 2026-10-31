/* 연구자 파일 등록·학생 공개: 원본 PDF 보관, 수업 진행 중 정답 조기 노출 차단 */
'use strict';
const crypto=require('crypto');
const {db}=require('./db');
const {httpError}=require('./util');
const Clock=require('./clock');
const REVIEW=require('./review');

const KINDS=['worksheet','answer','reflection'];
function number(v){const n=Number(v);if(!Number.isInteger(n)||n<1||n>8)throw httpError(400,'차시는 1~8만 선택할 수 있어요.','lesson');return n;}
function kind(v){if(!KINDS.includes(v))throw httpError(400,'자료 종류를 확인하세요.','kind');return v;}
async function manifest(){
 const rows=await db()`select lesson,kind,filename,sha256,bytes_count,updated_at from lesson_assets order by lesson,kind`;
 return {files:rows};
}
async function upload(tok,body){
 const lesson=number(body.lesson),type=kind(body.kind),filename=String(body.filename||'자료.pdf').slice(0,120);
 const b64=String(body.data_base64||'').trim();
 if(b64.length>2100000)throw httpError(413,'1.5MB를 넘는 파일입니다. PDF를 압축해 주세요.','size');
 if(!/^[A-Za-z0-9+/=\s]+$/.test(b64))throw httpError(400,'파일 데이터가 올바르지 않습니다.','format');
 const bytes=Buffer.from(b64,'base64');
 if(bytes.length<30||bytes.length>1550000||bytes.subarray(0,5).toString('ascii')!=='%PDF-')
   throw httpError(400,'PDF 형식만 등록할 수 있습니다. PPTX는 PDF로 변환한 뒤 올려 주세요.','pdf_only');
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const sql=db();
 const [before]=await sql`select sha256,filename from lesson_assets where lesson=${lesson} and kind=${type}`;
 await sql`insert into lesson_assets(lesson,kind,filename,mime,bytes_base64,sha256,bytes_count,updated_at)
   values(${lesson},${type},${filename},'application/pdf',${bytes.toString('base64')},${sha256},${bytes.length},now())
   on conflict(lesson,kind)do update set filename=excluded.filename,mime=excluded.mime,
   bytes_base64=excluded.bytes_base64,sha256=excluded.sha256,bytes_count=excluded.bytes_count,updated_at=now()`;
 const EV=require('./events');
 await EV.insert(sql,null,[EV.make('SETTINGS_CHANGE',{writer:'RESEARCHER',teacherId:tok.tid},{
   transition_reason:'LESSON_PDF_UPLOADED',extra:{lesson,kind:type,filename,sha256,bytes_count:bytes.length,replaces:before&&before.sha256||null}
 })]);
 return {ok:true,lesson,kind:type,filename,sha256,bytes_count:bytes.length,changed:!before||before.sha256!==sha256};
}
async function student(tok,query){
 const lesson=number(query.lesson),type=kind(query.kind),sql=db();
 const [session]=await sql`select * from sessions where id=${tok.ses}`;
 if(!session||session.status!=='open'||Number(session.lesson)!==lesson)throw httpError(403,'다른 수업 자료는 열 수 없습니다.','not_in_lesson');
 if(type==='answer'&&!REVIEW.status(await Clock.sync(sql,session.id)).unlocked)
   throw httpError(403,'Review 시작 6분 후에 정답지가 공개됩니다.','answer_locked');
 if(type==='reflection'&&!REVIEW.status(await Clock.sync(sql,session.id)).reflect_unlocked)
   throw httpError(403,'Review 시작 10분 후 성찰지가 열립니다.','reflection_locked');
 const [file]=await sql`select filename,mime,bytes_base64,sha256 from lesson_assets where lesson=${lesson} and kind=${type}`;
 if(!file)throw httpError(404,'해당 차시 자료가 아직 등록되지 않았습니다.','asset_missing');
 return {filename:file.filename,mime:file.mime,base64:file.bytes_base64,sha256:file.sha256};
}
module.exports={manifest,upload,student};
