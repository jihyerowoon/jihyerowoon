/* Offline deployment preflight. No user data, secrets or live DB access.
 * Fails CI for the regression that previously produced $(...).forEach is not a function. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(dir,f),'utf8');
const jsFiles=['public/app.js','lib/classroom.js','lib/student.js','lib/staff.js','lib/core.js','lib/engine.js','lib/content.js','lib/review.js','lib/clock.js','lib/assets.js','lib/csv-bank.js','lib/lessons-3-8.js','api/router.js'];
let passed=0;
function test(name,fn){try{fn();passed++;process.stdout.write('PASS '+name+'\n');}catch(e){process.stderr.write('FAIL '+name+'\n'+e.stack+'\n');process.exitCode=1;}}
for(const p of jsFiles)test('Syntax '+p,()=>new Function(read(p)));

test('Non-evaluative learner self-check for correct and incorrect answers and unchanged-answer gate',()=>{
 const C=require('../lib/content'),E=require('../lib/engine'),K=require('../lib/core');
 const item='L2RC01',fields={text:'두 쌍의 대변이 각각 평행한 사각형'};
 const fp=K.answerFingerprint(fields,{}),fpWhitespace=K.answerFingerprint({text:' 두 쌍의  대변이 각각 평행한 사각형 '},{});
 assert.equal(fp,fpWhitespace,'공백만 바꾸면 동일 답안');
 assert.notEqual(fp,K.answerFingerprint({text:fields.text+' 다른 검토 방법'},{}),'내용 변화 탐지');
 const judgment=E.judgeRule(item,'EXPERIMENT',fields,{},K.DEFAULT_SETTINGS);
 assert.equal(judgment.state,'CLEAR_INDEPENDENT');
 const ctx={stage:'Recite',itemId:item,group:'EXPERIMENT',settings:K.DEFAULT_SETTINGS,recs:{}};
 const first=E.onSubmit(E.newRec(),judgment,ctx).rec;
 const neutral=E.onHelp(first,{...ctx,responseFingerprint:fp,asksConfirmation:true});
 assert.ok(neutral.out.some(o=>o.kind==='support' && o.text===C.COMMON.SELF_CHECK.text));
 assert.ok(neutral.out.every(o=>!o.ack && !/답과 풀이의 근거가 모두 타당/.test(o.text)),'정오 확인 신호 없음');
 assert.ok(neutral.out.some(o=>o.requiresResubmission===false),'자기점검 뒤 수정 답안 강제하지 않음');
 assert.match(neutral.out[0].text,/다음 문제로 넘어가도 좋아요/);

 const fakeResubmit=E.onSubmit(neutral.rec,judgment,ctx).rec;
 const blocked=E.onHelp(fakeResubmit,{...ctx,responseFingerprint:fp,asksConfirmation:true});
 assert.deepEqual(blocked.out.map(o=>o.text),['스스로 점검하는 방법은 이미 안내했어요. 더 고칠 부분이 없다고 판단하면 다음 문제로 넘어가도 좋아요.']);
 assert.ok(blocked.out.every(o=>o.kind!=='support'&&o.kind!=='request'),'자기점검 반복 요청은 강제 수정 없이 종료');
 const changed=E.onHelp(fakeResubmit,{...ctx,responseFingerprint:K.answerFingerprint({text:fields.text+' 근거 추가'},{}),asksConfirmation:true});
 assert.ok(changed.out.some(o=>o.text===C.COMMON.SELF_CHECK.text),'수정 후 중립 점검 발문');
 const wrong=E.judgeRule(item,'EXPERIMENT',{text:'한 쌍의 대변이 평행한 사각형'},{},K.DEFAULT_SETTINGS);
 const wrongRec=E.onSubmit(E.newRec(),wrong,ctx).rec;
 const wrongCheck=E.onHelp(wrongRec,{...ctx,responseFingerprint:K.answerFingerprint({text:'한 쌍의 대변이 평행한 사각형'},{}),asksConfirmation:true});
 assert.ok(wrongCheck.out.some(o=>o.text===C.COMMON.SELF_CHECK.text),'오답에도 같은 중립 발문');
 const ctrlCtx={...ctx,group:'CONTROL'};
 const ctrl=E.onSubmit(E.newRec(),judgment,ctrlCtx).rec;
 const requested=E.onHelp(ctrl,{...ctrlCtx,responseFingerprint:fp,asksConfirmation:true});
 assert.ok(requested.out.some(o=>o.kind==='request'),'통제반 질문은 교사에게 전달');
 const selfCheckByTeacher=E.applyTeacherSupport(ctrl,1,fp);
 selfCheckByTeacher.selfCheckFingerprint=fp;
 const teacherClose=E.onHelp(selfCheckByTeacher,{...ctrlCtx,responseFingerprint:fp,asksConfirmation:true});
 assert.match(teacherClose.out[0].text,/다음 문제로 넘어가도 좋아요/);
 assert.match(read('lib/staff.js'),/requires_resubmission:mode==='self_check'\?false/);
 const teacherSupported=E.applyTeacherSupport(ctrl,1,fp);
 const repeated=E.onHelp(E.onSubmit(teacherSupported,judgment,ctrlCtx).rec,{...ctrlCtx,responseFingerprint:fp});
 assert.deepEqual(repeated.out.map(o=>o.text),['수정한 답을 쓰고 질문을 하세요.']);
 assert.match(read('public/app.js'),/data-self-check-send/);
 assert.doesNotMatch(read('public/app.js'),/data-verified-send|mode:'verified'/);
 assert.match(read('public/app.js'),/if \(r\.attempts > 0\) return \[r\.attempts > 1/);
 assert.doesNotMatch(read('public/app.js'),/if \(r\.status === 'clear'\) return \['기록 완료'/);

 assert.match(read('lib/staff.js'),/mode==='self_check'\?C\.COMMON\.SELF_CHECK\.text/);
 assert.doesNotMatch(read('lib/staff.js'),/confirmed_by_teacher|TEACHER_CONFIRMED_CORRECT/);
 assert.doesNotMatch(read('lib/engine.js'),/verifiedCorrect|VERIFIED_COMPLETE_SELF_CHECK_V1/);
 assert.match(read('lib/student.js'),/asksConfirmation: asksConfirmation/);
 const pending=E.judgeRule('L3RD02','EXPERIMENT',{answer:'3',work:'조건 확인'},{},K.DEFAULT_SETTINGS);
 assert.equal(pending.state,'AMBIGUOUS','3~8차시 정오 확정 금지');
});
test('Teacher roster shows pink online presence in worksheet and summary tile modes',()=>{
 const app=read('public/app.js'),css=read('public/index.html');
 assert.match(app,/var presence=offline\?' offline-presence':' online'/);
 assert.match(app,/worksheet-tile '\+kind\+presence/);
 assert.match(app,/student-tile '\+kind\+presence/);
 assert.match(app,/미접속':'● 접속 중'/);
 assert.match(app,/nowMs\(\)-Date\.parse\(p\.last_seen\)>90000/);
 assert.match(css,/student-tile\.online\.worksheet-tile/);
 assert.match(css,/border:3px solid #e00070/);
 assert.match(css,/tile-presence\.is-online/);
 assert.match(css,/student-tile\.offline\.worksheet-tile/);
});
test('All eight lesson tutor prompts render segment overlines but never change triangle, angle, or AI tokens',()=>{
 const C=require('../lib/content');
 const app=read('public/app.js'),css=read('public/index.html');
 const match=app.match(/  function fmt\(s\) \{[\s\S]*?\n  \}/);
 assert.ok(match,'student-safe math formatter defined');
 const escape=t=>String(t).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const fmt=new Function('esc',match[0]+'; return fmt;')(escape);
 const result=fmt('선분 AB ∥ CD, AO = CO, △ABC ≡ △DEF, ∠AOB, AI 튜터, {EO}, PC');
 for(const token of ['AB','CD','AO','CO','EO','PC'])assert.match(result,new RegExp('math-segment[^>]*>'+token+'</span>'),token+' must have overline');
 assert.match(result,/△ABC/);assert.match(result,/△DEF/);assert.match(result,/∠AOB/);assert.match(result,/AI 튜터/);
 assert.doesNotMatch(result,/<span[^>]*>AI<\/span>/);
 assert.doesNotMatch(result,/<span[^>]*>ABC<\/span>/);
 assert.match(css,/\.math-segment\s*\{[^}]*border-top:2px solid currentColor/);
 for(let lesson=1;lesson<=8;lesson++){
   const prompt=C.BANK.filter(e=>e.lesson===lesson&&e.level===1);
   assert.ok(prompt.length>0,'lesson '+lesson+' prompts');
   for(const e of prompt){
     const html=fmt(e.text);
     assert.doesNotMatch(html,/\{(?:AB|CD|AO|CO|EO|PC)\}/,'Unrendered segment in '+e.id);
   }
 }
});
test('Never apply forEach to one DOM element',()=>{
 const source=read('public/app.js');
 assert.doesNotMatch(source,/(?<!\$)\$\([^)]*\)\.forEach\s*\(/);
 assert.match(source,/\$\$\('\[data-filter\]'\)\.forEach/);
 assert.match(source,/\$\$\('\[data-grid-mode\]'\)\.forEach/);
 assert.match(source,/\$\$\('\[data-itab\]', n\)\.forEach/);
});
test('Lesson 3-8 verified crops render as image inside independent cards',()=>{
 const app=read('public/app.js');
 assert.match(app,/header\.insertAdjacentHTML\('afterend',panel\)/);
 assert.match(app,/var LESSON_PROBLEM_CROPS=/);
 assert.match(app,/Student\.problemPanel=function/);
 assert.match(app,/data-pdf-crop="problem"/);
 assert.match(app,/canvas\.toDataURL\('image\/png'\)/);
 assert.match(app,/pageMap=\{0:\[1\],1:\[1\],2:\[3,4\],3:\[5,6,7\],4:\[\],5:\[9\]\}/);
 assert.match(app,/header\.insertAdjacentHTML\('afterend',panel\)/);
 assert.match(app,/self\.problemCropSpec\(page\)/);
 assert.doesNotMatch(app,/self\.pdfPanel\('worksheet'/);
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
test('Lesson 3-8 field help buttons exclude Preview and concept memo while 1-2 remain intact',()=>{
 const app=read('public/app.js'),C=require('../lib/content');
 assert.match(app,/self\.lesson\(\)>=3 && it\.stage!=='Preview' && it\.kind!=='memo'/);
 assert.match(app,/data-help-field/);
 assert.match(app,/self\.lesson\(\)>=3\) \? ''/);
 for(let n=3;n<=8;n++)for(const stage of ['Read','Reflect','Recite','Review']){
  const items=C.ITEMS.filter(it=>it.lesson===n&&it.stage===stage&&!it.archived);
  assert.ok(items.length>0,n+' '+stage);
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
 assert.match(s,/action==='finish'&&\['running','reflection','paused','catchup'\]/);
 assert.match(s,/action==='review-release'/);
 assert.match(s,/action==='review-reflect'/);
});
test('Students and teachers can copy run-specific login links',()=>{
 const s=read('public/app.js');
 for(const token of ["function shareLink(role,classCode,sessionCode)","u.searchParams.set('session',sessionCode)","u.searchParams.set('class',classCode)","u.hash=role==='teacher'?'login-teacher':'login-student'","$('#teacher-student-share').onclick","$('#teacher-staff-share').onclick","session_code:linkSession()","Teacher.start(linkSession()||null)"]){
   assert.ok(s.includes(token),token);
 }
 assert.doesNotMatch(s,/u\.searchParams\.set\(['"](?:pin|password)['"]/i);
});
test('All 576 researcher-supplied prompts cover eight lessons and 72 question units',()=>{
  const C=require('../lib/content');
  assert.equal(Object.keys(C.LESSONS).length,8);
  assert.equal(C.BANK.length,576);
  const all=new Set(C.ITEMS.map(i=>i.id));
  assert.equal(new Set(C.BANK.map(e=>e.id)).size,576,'Duplicate prompt identifiers');
  for(let n=1;n<=8;n++) assert.equal(C.BANK.filter(e=>e.lesson===n).length,72,'lesson '+n);
  assert.equal(new Set(C.BANK.map(e=>e.item)).size,72);
  for(const entry of C.BANK){
    assert.ok(all.has(entry.item),'Missing item '+entry.item);
    assert.equal(entry.level,1);
    assert.ok(entry.text.length>=8);
    assert.ok(entry.priority>=1&&entry.priority<=8);
    assert.equal(entry.src,'USER_CSV_576_20261103');
  }
});
test('Review opens both answers and reflection automatically after four minutes',()=>{
 const R=require('../lib/review'),start=Date.now();
 const session={status:'open',stage:5,lesson:3,stage_opened:{5:new Date(start).toISOString()},clock:{mode:'running'}};
 for(const minutes of [0,2,3.999,4,5,10,12]){
  const v=R.status(session,start+Math.round(minutes*60000));
  assert.equal(v.unlocked,minutes>=4,'Answer release at minute '+minutes);
  assert.equal(v.reflect_unlocked,minutes>=4,'Reflection release at minute '+minutes);
 }
 assert.equal(R.status(session,start).delay_seconds,240);
 const app=read('public/app.js');
 assert.match(app,/4분 뒤 정답 및 성찰지 동시 공개/);
 assert.match(app,/data-clock="finish"/);
 assert.match(app,/내용을 보고 필요한 시간이 얼마일지 목표설정을 해보세요/);
 const clock=read('lib/clock.js');
 assert.match(clock,/action==='finish'&&\['running','reflection','paused','catchup'\]/);
 assert.match(read('lib/record-download.js'),/report-print-button/);
 assert.match(read('public/report-print.js'),/window\.print\(\)/);
});
test('Prior stage edits require complete active stage, Recite five minutes, and a persisted reentry lock',()=>{
 const s=read('lib/student.js'),a=read('public/app.js');
 assert.match(s,/RECITE_EXIT_LOCK_20261103/);
 assert.match(s,/now-start>=300000/);
 assert.match(s,/currentComplete\(sql,s,student\)/);
 assert.match(s,/recite_minimum_five_minutes/);
 assert.match(s,/if\(idx===4&&ps\.locked\)/);
 assert.match(s,/REVIEW\.status\(s\)\.unlocked/);
 assert.match(s,/STUDENT_STAGE_REVISIT/);
 assert.match(a,/me\/navigate/);
 assert.match(a,/Recite로 돌아와도 Recite 답안은 다시 작성할 수 없습니다/);
 assert.match(a,/this\.view<idx&&this\.view!==4&&this\.canRevisit\(\)/);
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
