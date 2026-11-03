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

test('Correct-answer confirmation only for verified student request, with unchanged-answer gate in both groups',()=>{
 const E=require('../lib/engine'),K=require('../lib/core');
 const item='L2RC01',fields={text:'두 쌍의 대변이 각각 평행한 사각형'};
 const fp=K.answerFingerprint(fields,{}),fpWhitespace=K.answerFingerprint({text:' 두 쌍의  대변이 각각 평행한 사각형 '}, {});
 assert.equal(fp,fpWhitespace,'공백이나 필드 순서만 변경하면 같은 답안');
 assert.notEqual(fp,K.answerFingerprint({...fields,text:fields.text+' 변의 관계를 근거로 다시 설명'},{}),'실제 풀이 변화 탐지');
 const judgment=E.judgeRule(item,'EXPERIMENT',fields,{},K.DEFAULT_SETTINGS);
 assert.equal(judgment.state,'CLEAR_INDEPENDENT');
 assert.equal(judgment.decisive,true);
 const ctx={stage:'Recite',itemId:item,group:'EXPERIMENT',settings:K.DEFAULT_SETTINGS,recs:{}};
 const first=E.onSubmit(E.newRec(),judgment,ctx).rec;
 const confirmed=E.onHelp(first,{...ctx,responseFingerprint:fp,verifiedCorrect:true});
 assert.ok(confirmed.out.some(o=>o.kind==='support'&&o.ack===true&&o.requiresResubmission===false));
 assert.match(confirmed.out[0].text,/답과 풀이의 근거가 모두 타당해요/);
 const fakeResubmit=E.onSubmit(confirmed.rec,judgment,ctx).rec;
 const blocked=E.onHelp(fakeResubmit,{...ctx,responseFingerprint:fp,verifiedCorrect:true});
 assert.deepEqual(blocked.out.map(o=>o.text),['수정한 답을 쓰고 질문을 하세요.']);
 assert.ok(!blocked.out.some(o=>o.kind==='support'||o.kind==='request'));
 const changed=E.onHelp(fakeResubmit,{...ctx,responseFingerprint:K.answerFingerprint({...fields,text:fields.text+' 변의 관계를 근거로 다시 설명'},{}),verifiedCorrect:false});
 assert.ok(changed.out.some(o=>o.kind==='support'),'수정 후 요청은 허용');
 const earlyWrong=E.judgeRule(item,'EXPERIMENT',{text:'한 쌍의 대변이 평행한 사각형'},{},K.DEFAULT_SETTINGS);
 const wrongRec=E.onSubmit(E.newRec(),earlyWrong,ctx).rec;
 const earlyHelp=E.onHelp(wrongRec,{...ctx,responseFingerprint:K.answerFingerprint({text:'한 쌍의 대변이 평행한 사각형'},{}),verifiedCorrect:false});
 assert.ok(earlyHelp.out.some(o=>o.kind==='support'),'오답 도움 요청에는 기존 은행 발문');
 const revisedCorrect=E.onSubmit(earlyHelp.rec,judgment,ctx).rec;
 const afterHint=E.onHelp(revisedCorrect,{...ctx,responseFingerprint:fp,verifiedCorrect:true});
 assert.ok(afterHint.out.some(o=>o.ack),'수정 후 완전 정답이라면 앞서 힌트를 받았더라도 확인 응답');
 assert.ok(afterHint.rec.verifiedConfirmationSent,'확인 메시지는 일회성');
 const unverified=E.onHelp(first,{...ctx,responseFingerprint:fp,verifiedCorrect:false});
 assert.ok(!unverified.out.some(o=>o.ack),'미검증 답안에 정답 확인 메시지 금지');
 const ctrlCtx={...ctx,group:'CONTROL'};
 const ctrl=E.onSubmit(E.newRec(),judgment,ctrlCtx).rec;
 const requested=E.onHelp(ctrl,{...ctrlCtx,responseFingerprint:fp,verifiedCorrect:false});
 assert.ok(requested.out.some(o=>o.kind==='request'),'통제반 최초 문의는 교사에게 전달');
 const teacherSupported=E.applyTeacherSupport(ctrl,1,fp);
 const repeated=E.onHelp(E.onSubmit(teacherSupported,judgment,ctrlCtx).rec,{...ctrlCtx,responseFingerprint:fp});
 assert.deepEqual(repeated.out.map(o=>o.text),['수정한 답을 쓰고 질문을 하세요.']);
 assert.match(read('public/app.js'),/data-verified-send/);
 assert.match(read('lib/staff.js'),/confirmed_by_teacher:true/);
 assert.match(read('lib/student.js'),/responseFingerprint: responseFingerprint, verifiedCorrect:!!verifiedCorrect/);
 const pending=E.judgeRule('L3RD02','EXPERIMENT',{answer:'3',work:'조건 확인'},{},K.DEFAULT_SETTINGS);
 assert.equal(pending.state,'AMBIGUOUS','3~8차시는 정오 자동확정 금지');
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
 assert.match(s,/action==='finish' && c\.mode==='reflection'/);
});
test('Students and teachers can copy run-specific login links',()=>{
 const s=read('public/app.js');
 for(const token of ["function shareLink(role,classCode,sessionCode)","u.searchParams.set('session',sessionCode)","u.searchParams.set('class',classCode)","u.hash=role==='teacher'?'login-teacher':'login-student'","$('#teacher-student-share').onclick","$('#teacher-staff-share').onclick","session_code:linkSession()","Teacher.start(linkSession()||null)"]){
   assert.ok(s.includes(token),token);
 }
 assert.doesNotMatch(s,/u\.searchParams\.set\(['"](?:pin|password)['"]/i);
});
test('1-8 lesson coverage and 560 base plus 100 Recite plus 60 evidence checks',()=>{
 const C=require('../lib/content');
 assert.equal(Object.keys(C.LESSONS).length,8);
 assert.equal(C.BANK.length,720);
 const checks=C.BANK.filter(e=>e.variant==='reasoning20261102');
 assert.equal(checks.length,60,'3-8차시 수학적 근거 점검 발문 60개');
 assert.equal(new Set(checks.map(e=>e.item)).size,30,'Read Reflect Review 총 30문항');
 for(const p of checks){
  assert.equal(p.group,null,'동일 발문을 두 집단에 제공');
  assert.equal(p.review_status,'EXPERT_REVIEW_PENDING','내용타당도 검토 전임을 보존');
  assert.equal(p.state,'AMBIGUOUS','미검증 3-8차시 정답을 단정하지 않음');
  assert.ok(p.text.length>=18 && p.text.length<=130 && /[?？]/.test(p.text),'간결한 질문 표현');
  assert.doesNotMatch(p.text,/정답은|답은\s*\d|\b(?:SSS|SAS|ASA)\b/i,'정답 힌트 노출 방지');
 }

 for(let n=1;n<=8;n++){
  assert.equal(C.BANK.filter(e=>e.lesson===n).length,n<3?70:n===3||n===8?100:95,'lesson '+n);
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
