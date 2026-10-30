'use strict';
const C=require('./content'),DB=require('./db'),Room=require('./classroom');
const {httpError}=require('./util');
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function documentFor(st,lesson,records){
 let h='<html><head><meta charset="UTF-8"></head><body><h1>PQ4R 학습기록 '+esc(st.code)+'</h1>';
 for(const stage of C.STAGES){h+='<h2>'+esc(stage.id)+'</h2>';for(const it of C.ITEMS.filter(it=>it.lesson===lesson&&it.stage===stage.id&&!it.archived)){h+='<h3>'+esc(it.title)+'</h3>';const versions=records[it.id]||[];versions.forEach((v,i)=>{h+='<p><b>'+(i?'수정 답변':'최초 답변')+'</b></p>';for(const f of it.fields)h+='<p>'+esc(f.label)+': '+esc(v.fields&&v.fields[f.key]||'')+'</p>';if(i)h+='<p>수정 이유: '+esc(v.reason||'')+'</p>';});}}
 return Buffer.from(h+'</body></html>','utf8');
}
function allowed(s){return s.status!=='open'||(s.clock||{}).mode==='finished';}
async function record(sql,s,st){const rows=await sql`select item_id,versions from item_states where session_id=${s.id} and student_id=${st.id}`;return documentFor(st,Number(s.lesson),Object.fromEntries(rows.map(r=>[r.item_id,r.versions||[]])));}
async function mine(tok){const sql=DB.db(),[s]=await sql`select * from sessions where id=${tok.ses}`,[st]=await sql`select id,code from students where id=${tok.sub} and active=true`;if(!s||!st)throw httpError(403,'허용되지 않습니다.','forbidden');if(!allowed(s))throw httpError(409,'수업 종료 후 다운로드 가능합니다.','not_finished');const [p]=await sql`select student_id from participants where session_id=${s.id} and student_id=${st.id}`;if(!p)throw httpError(403,'해당 수업 학생이 아닙니다.','forbidden');return {filename:'PQ4R_'+st.code+'.doc',base64:(await record(sql,s,st)).toString('base64')};}
async function all(tok,q){const s=await Room.access(tok,q.session);if(!allowed(s))throw httpError(409,'수업 종료 후 다운로드 가능합니다.','not_finished');const sql=DB.db(),rows=await sql`select st.id,st.code from participants p join students st on st.id=p.student_id where p.session_id=${s.id} order by st.code`;const files=[];for(const st of rows)files.push({filename:'PQ4R_'+st.code+'.doc',base64:(await record(sql,s,st)).toString('base64')});return {files};}
module.exports={mine,all};