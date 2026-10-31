/* Review: 6분 자기점검 후 동일 해설 공개, 별도 사후 성찰 회귀검사 */
'use strict';
const assert=require('node:assert/strict');
const C=require('../lib/content'),R=require('../lib/review'),E=require('../lib/engine');
let passes=0;
function ok(v,label){assert.ok(v,label);passes++;}
for(const lesson of [1,2]){
  const sols=R.publicSolutions(lesson);
  ok(sols.length===5,lesson+'차시 3개 Reflect + 1개 Review + 1개 Read 정답');
  ok(sols.filter(x=>x.item_id.includes('RF')).length===3,lesson+'차시 Reflect 세 문항');
  ok(sols.some(x=>x.item_id==='L'+lesson+'RD02'),lesson+'차시 Read 개념확인 해설 반영');
  ok(sols.every(x=>x.answer&&x.steps.length>=2&&x.problem),lesson+'차시 정답과 단계별 해설');
  ok(C.LESSONS[lesson].min[5]===12,lesson+'차시 Review 12분');
  ok(JSON.stringify(C.LESSONS[lesson].min)===JSON.stringify([2,2,16,19,9,12]),lesson+'차시 원래 60분 시간표 유지');
  ok(E.itemsForStage('Review','EXPERIMENT',{},lesson).length===1,lesson+'차시 Review 풀이 1문항만 노출');
  const rv=E.resolveItem('L'+lesson+'RV01','EXPERIMENT',{});
  const rvTeacher=E.resolveItem('L'+lesson+'RV01','CONTROL',{});
  ok(rv.fields.some(f=>f.key==='pre_confidence'&&f.kind==='choice'&&f.options.length===3),lesson+'차시 정답 공개 전 확신도 3가지');
  ok(JSON.stringify(rv.fields)===JSON.stringify(rvTeacher.fields),lesson+'차시 두 집단 동일 자기확신도 문항');
}
const t=Date.parse('2026-10-23T00:00:00.000Z');
const sess={stage:5,status:'open',stage_opened:{5:new Date(t).toISOString()}};
ok(!R.status(sess,t+359999).unlocked,'6분 전 정답 비공개');
ok(R.status(sess,t+360000).release_ready,'6분부터 교사 공개 버튼 활성화');
ok(!R.status(sess,t+360000).unlocked,'6분 경과만으로 해설 자동 공개 금지');
const approved={...sess,review_feedback_released_at:new Date(t+360000).toISOString()};
ok(!R.status(approved,t+359999).unlocked,'교사가 승인했더라도 6분 전에는 비공개');
ok(R.status(approved,t+360000).unlocked,'6분 후 교사가 승인하면 해설 공개');
ok(!R.status(approved,t+599999).reflect_unlocked,'10분 전 성찰 입력 차단');
ok(!R.status(sess,t+600000).reflect_unlocked,'공개 승인 없으면 10분 후에도 성찰 차단');
ok(R.status(approved,t+600000).reflect_unlocked,'교사 공개 승인 후 10분부터 성찰 입력 허용');
ok(R.status(sess,t).delay_seconds===360&&R.status(sess,t).reflect_seconds===120,'6분 공개와 2분 성찰 설정');
ok(R.status(sess,t+1).release_at===new Date(t+360000).toISOString(),'서버 절대 시각 공개');
ok(!R.status({...approved,stage:4},t+500000).unlocked,'Recite 단계 정답 비공개');
ok(!R.status({...approved,status:'closed'},t+500000).unlocked,'수업 종료 후 신규 응답 불가');
ok(R.normalizeReflection({focus_item:'L1RF01',understanding:'uncertain',comparison:'이해 안 됨',next_step:'다시 확인'}).understanding==='uncertain','이해 안 됨도 성찰로 인정');
for (const x of ['explain','partial','uncertain']) ok(R.normalizeReflection({focus_item:'L2RF03',understanding:x,comparison:'a',next_step:'b'}).understanding===x,'세 자기평가 선택지');
try {R.normalizeReflection({focus_item:'L1RV01',understanding:'no',comparison:'a',next_step:'b'});throw new Error('미승인 응답 통과');} catch(e){ok(e.message!=='미승인 응답 통과','미승인 응답 차단');}
try {R.normalizeReflection({focus_item:'L2RF04',understanding:'explain',comparison:'a',next_step:'b'});throw new Error('없는 문항 통과');} catch(e){ok(e.message!=='없는 문항 통과','없는 문항 선택 금지');}
let audit=E.fidelity([
{event_type:'REVIEW_PRE_SNAPSHOT'},
{event_type:'REVIEW_FEEDBACK_OPEN',event_timestamp:new Date(t+360010).toISOString(),extra:{release_at:new Date(t+360000).toISOString()}},
{event_type:'REVIEW_POST_REFLECTION'}
]);
ok(audit.reviewSnapshots===1,'공개 전 응답 보존 집계');
ok(audit.reviewFeedbackOpens===1,'해설 열람 집계');
ok(audit.reviewPostReflections===1,'해설 후 성찰 집계');
ok(audit.earlyReviewDisclosure===0,'조기 공개 없음');
console.log('PASS '+passes+': Review 공개 시각 및 성찰 기록 핵심 규칙');
