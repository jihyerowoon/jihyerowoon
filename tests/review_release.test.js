/* Review: 8분 자기점검 후 동일 해설 공개, 별도 사후 성찰 회귀검사 */
'use strict';
const assert=require('node:assert/strict');
const C=require('../lib/content'),R=require('../lib/review'),E=require('../lib/engine');
let passes=0;
function ok(v,label){assert.ok(v,label);passes++;}
for(const lesson of [1,2]){
  const sols=R.publicSolutions(lesson);
  ok(sols.length===4,lesson+'차시 3개 Reflect + 1개 Review 정답');
  ok(sols.filter(x=>x.item_id.includes('RF')).length===3,lesson+'차시 Reflect 세 문항');
  ok(sols.every(x=>x.answer&&x.steps.length>=2&&x.problem),lesson+'차시 정답과 단계별 해설');
  ok(C.LESSONS[lesson].min[5]===12,lesson+'차시 Review 12분');
}
const t=Date.parse('2026-10-23T00:00:00.000Z');
const sess={stage:5,status:'open',stage_opened:{5:new Date(t).toISOString()}};
ok(!R.status(sess,t+479999).unlocked,'8분 전 정답 비공개');
ok(R.status(sess,t+480000).unlocked,'8분부터 해설 공개');
ok(R.status(sess,t+1).release_at===new Date(t+480000).toISOString(),'서버 절대 시각 공개');
ok(!R.status({...sess,stage:4},t+500000).unlocked,'Recite 단계 정답 비공개');
ok(!R.status({...sess,status:'closed'},t+500000).unlocked,'수업 종료 후 신규 응답 불가');
ok(R.normalizeReflection({understanding:'uncertain',comparison:'이해 안 됨',next_step:'다시 확인'}).understanding==='uncertain','이해 안 됨도 성찰로 인정');
for (const x of ['explain','partial','uncertain']) ok(R.normalizeReflection({understanding:x,comparison:'a',next_step:'b'}).understanding===x,'세 자기평가 선택지');
try {R.normalizeReflection({understanding:'no',comparison:'a',next_step:'b'});throw new Error('미승인 응답 통과');} catch(e){ok(e.message!=='미승인 응답 통과','미승인 응답 차단');}
let audit=E.fidelity([
{event_type:'REVIEW_PRE_SNAPSHOT'},
{event_type:'REVIEW_FEEDBACK_OPEN',event_timestamp:new Date(t+480010).toISOString(),extra:{release_at:new Date(t+480000).toISOString()}},
{event_type:'REVIEW_POST_REFLECTION'}
]);
ok(audit.reviewSnapshots===1,'공개 전 응답 보존 집계');
ok(audit.reviewFeedbackOpens===1,'해설 열람 집계');
ok(audit.reviewPostReflections===1,'해설 후 성찰 집계');
ok(audit.earlyReviewDisclosure===0,'조기 공개 없음');
console.log('PASS '+passes+': Review 공개 시각 및 성찰 기록 핵심 규칙');
