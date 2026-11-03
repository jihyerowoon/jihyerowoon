/* 2026-10-23 연구용 공통 활동지 정합성 검사. node tests/research-worksheet.test.js */
'use strict';
const assert = require('node:assert/strict');
const C = require('../lib/content');
const E = require('../lib/engine');
const STAGE_ORDER = ['Preview','Question','Read','Reflect','Recite','Review'];
const MINUTES = [2,2,16,19,9,12];
const ids = ['L1RF01','L1RF02','L1RF03','L2RF01','L2RF02','L2RF03'];
for (const lesson of [1, 2]) {
  assert.deepEqual(C.LESSONS[lesson].min, MINUTES, lesson + '차시 단계 시간 불일치');
  assert.equal(C.LESSONS[lesson].total, 60, lesson + '차시 총 시간 불일치');
}
assert.deepEqual(C.STAGES.map(x=>x.id),STAGE_ORDER,'PQ4R 순서 불일치');
assert(C.STAGES.every(x=>x.cap===1 && x.auto===false),'자동 질문 및 다중 수준이 남음');
for (const id of ids) {
  const a=E.resolveItem(id,'EXPERIMENT',{}), b=E.resolveItem(id,'CONTROL',{});
  assert.equal(a.fixedAI?.text,b.fixedAI?.text,id+' 공통 검토 설명 불일치');
  assert.deepEqual(a.fields,b.fields,id+' 답변 입력란 불일치');
  assert.deepEqual(a.choices,b.choices,id+' 선택지 불일치');
  assert.equal(a.title,b.title,id+' 문제 진술 불일치');
}
const x=E.onSubmit(null,{state:'MISAPPLIED_PROPERTY',misc:'',missing:[]},{stage:'Read',itemId:'L1RD02',group:'EXPERIMENT',settings:{},recs:{}});
assert.equal(x.out.filter(z=>z.kind==='support').length,0,'제출 직후 자동 지원 금지 위반');
const h1=E.onHelp(x.rec,{stage:'Read',itemId:'L1RD02',group:'EXPERIMENT'});
assert.equal(h1.out.filter(z=>z.kind==='support').length,1,'첫 요청 질문 제공 실패');
assert.equal(h1.rec.level,1,'첫 지원이 단일 수준을 벗어남');
const hrepeat=E.onHelp(h1.rec,{stage:'Read',itemId:'L1RD02',group:'EXPERIMENT'});
assert.equal(hrepeat.out.filter(z=>z.kind==='support').length,0,'재응답 없는 연속 지원 금지 위반');
const x2=E.onSubmit(h1.rec,{state:'MISAPPLIED_PROPERTY',misc:'',missing:[]},{stage:'Read',itemId:'L1RD02',group:'EXPERIMENT',settings:{},recs:{}});
const h2=E.onHelp(x2.rec,{stage:'Read',itemId:'L1RD02',group:'EXPERIMENT'});
assert.equal(h2.out.filter(z=>z.kind==='support').length,1,'재응답 후 반복 지원 실패');
assert.equal(h2.rec.level,1,'반복 질문이 다중 수준으로 상승함');
for(const id of ids){ const o=E.resolveItem(id,'CONTROL',{});assert(o.fixedAI,'통제집단 검토자료 누락: '+id); }
console.log('PASS: 1·2차시 60분, 6개 Reflect 공통 조건, 단일 수준, 재응답 후 반복 지원');
