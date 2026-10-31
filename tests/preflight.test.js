/* Offline deployment preflight. No user data, secrets or live DB access.
 * Fails CI for the regression that previously produced $(...).forEach is not a function. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(dir,f),'utf8');
const jsFiles=['public/app.js','lib/classroom.js','lib/student.js','lib/content.js','lib/review.js','lib/clock.js','lib/assets.js','lib/csv-bank.js','lib/lessons-3-8.js','api/router.js'];
let passed=0;
function test(name,fn){try{fn();passed++;process.stdout.write('PASS '+name+'\n');}catch(e){process.stderr.write('FAIL '+name+'\n'+e.stack+'\n');process.exitCode=1;}}
for(const p of jsFiles)test('Syntax '+p,()=>new Function(read(p)));
test('Never apply forEach to one DOM element',()=>{
 const source=read('public/app.js');
 assert.doesNotMatch(source,/(?<!\$)\$\([^)]*\)\.forEach\s*\(/);
 assert.match(source,/\$\$\('\[data-filter\]'\)\.forEach/);
 assert.match(source,/\$\$\('\[data-grid-mode\]'\)\.forEach/);
 assert.match(source,/\$\$\('\[data-itab\]', n\)\.forEach/);
});
test('Lesson 3-8 worksheet pages precede independent per-question cards',()=>{
 const app=read('public/app.js');
 assert.match(app,/insertAfter\.insertAdjacentHTML\('afterend',panel\)/);
 assert.doesNotMatch(app,/overlay\.appendChild\(fields\)/);
 assert.match(app,/card\.classList\.add\('lesson-independent-question'\)/);
 for(let lesson=3;lesson<=8;lesson++){
   const C=require('../lib/content');
   for(const stage of ['Question','Reflect','Recite','Review']){
    const rows=C.ITEMS.filter(it=>it.lesson===lesson&&it.stage===stage&&!it.archived);
    assert.ok(rows.length>=1,lesson+':'+stage);
    assert.ok(rows.every(it=>it.id&&it.fields.length>=1),lesson+':'+stage+' fields');
   }
 }
});
test('All eight lessons have Preview Recite Review and consistent help and worksheet rendering',()=>{
 const C=require('../lib/content'),src=read('public/app.js');
 for(let n=1;n<=8;n++){
  for(const stage of ['Preview','Recite','Review'])assert.ok(C.ITEMS.some(it=>it.lesson===n&&it.stage===stage&&!it.archived),n+' missing '+stage);
  assert.ok(C.BANK.some(b=>b.item==='L'+n+'RV01'),n+' missing Review prompts');
  assert.ok(C.BANK.some(b=>b.item==='L'+n+'RC01'),n+' missing Recite prompts');
 }
 assert.match(src,/it\.stage === 'Preview' \|\| it\.kind === 'memo'/);
 assert.match(src,/ITEM\[id\]\.stage !== 'Review'/);
 assert.match(src,/rvCard\.after\(bottom\)/);
 assert.match(src,/data-pdf-status class="hint small"/);
 assert.doesNotMatch(src,/''\+\s*\+\s*'<\/div>/);
 assert.doesNotMatch(src,/pdfPanel\('reflection'/);
 assert.match(src,/review-reflection/);
});
test('Student may enter exact waiting session before or after teacher',()=>{
 const s=read('lib/student.js'),c=read('lib/classroom.js');
 assert.match(s,/const directSession=K\.normCode\(body\.session_code\|\|''\)/);
 assert.match(s,/session\.class_name\)\s*!==K\.normCode\(body\.class_code\)/);
 assert.match(c,/tx\.json\(\{mode:'waiting',ready:true\}\)/);
 assert.match(c,/const settings=\{autoTimer:true/);
});
test('Teacher starts clock explicitly',()=>{
 const s=read('lib/clock.js');
 assert.match(s,/action==='start' && c\.mode==='waiting'/);
 assert.match(s,/c\.started_at=iso\(now\)/);
 assert.match(s,/action==='finish' && c\.mode==='reflection'/);
});
test('Students and teachers can copy run-specific login links',()=>{
 const s=read('public/app.js');
 for(const token of ["function shareLink(role,classCode,sessionCode)","u.searchParams.set('session',sessionCode)","u.searchParams.set('class',classCode)","u.hash=role==='teacher'?'login-teacher':'login-student'","$('#teacher-student-share').onclick","$('#teacher-staff-share').onclick","session_code:linkSession()","Teacher.start(linkSession()||null)"]){
   assert.ok(s.includes(token),token);
 }
 assert.doesNotMatch(s,/u\.searchParams\.set\(['"](?:pin|password)['"]/i);
});
test('1-8 lesson coverage and 560 base plus 100 Recite prompts',()=>{
 const C=require('../lib/content');
 assert.equal(Object.keys(C.LESSONS).length,8);
 assert.equal(C.BANK.length,660);
 for(let n=1;n<=8;n++){
  assert.equal(C.BANK.filter(e=>e.lesson===n).length,n<3?70:n===3||n===8?90:85,'lesson '+n);
 }
 const all=new Set(C.ITEMS.map(i=>i.id));
 for(const entry of C.BANK)assert.ok(all.has(entry.item),'Missing item '+entry.item);
});
test('Review public windows and ongoing reflection',()=>{
 const R=require('../lib/review');
 const start=Date.now(),session={status:'open',stage:5,lesson:3,stage_opened:{5:new Date(start).toISOString()},clock:{mode:'reflection'}};
 for(const [minutes,answer,reflection] of [[0,false,false],[5.999,false,false],[6,true,false],[9.999,true,false],[10,true,true],[12,true,true],[30,true,true]]){
  const s=R.status(session,start+Math.round(minutes*60000));
  assert.equal(s.unlocked,answer,'Answer '+minutes);
  assert.equal(s.reflect_unlocked,reflection,'Reflection '+minutes);
 }
});
test('Version and browser asset always updated together',()=>{
 const v=require('../package.json').version;
 assert.match(read('public/index.html'),new RegExp('app\\.js\\?v='+v.replace(/\./g,'\\.')));
 assert.match(read('lib/content.js'),new RegExp('mvp-'+v.replace(/\./g,'\\.')));
});
test('No accidental research-record deletion in fixed provisioning',()=>{
 const s=read('lib/classroom.js');
 assert.doesNotMatch(s,/\bdelete\s+from\s+(events|item_states|messages|participants)\b/i);
 assert.match(s,/set grp=\$\{e\.group\},class_name=\$\{e\.class_code\}/);
});
if(!process.exitCode)process.stdout.write('All '+passed+' preflight checks passed.\n');
