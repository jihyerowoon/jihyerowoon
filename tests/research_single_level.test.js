/* 2026-10-23 연구 설계 회귀검사: node tests/research_single_level.test.js */
'use strict';
const assert = require('node:assert/strict');
const C = require('../lib/content');
const E = require('../lib/engine');
let passes = 0;
function ok(condition, name) { assert.ok(condition, name); passes++; }
for (const lesson of [1, 2]) {
  const L = C.LESSONS[lesson];
  ok(L.total === 60 && L.min.reduce((a, b) => a + b, 0) === 60, lesson + '차시 수업시간 60분');
}
ok(C.STAGES.every((s) => s.cap === 1 && !s.auto), '1유형 1수준, 자동 발문 없음');
for (const it of C.ITEMS.filter((i) => i.stage === 'Reflect')) {
  const ai = E.resolveItem(it.id, 'EXPERIMENT', {});
  const teacher = E.resolveItem(it.id, 'CONTROL', {});
  ok(JSON.stringify(ai) === JSON.stringify(teacher), it.id + ' 공통 문제와 답변란');
}
for (const it of C.ITEMS.filter((x) => !x.archived)) {
  const a = E.bankFor(it.id, 1, 'EXPERIMENT');
  const b = E.bankFor(it.id, 1, 'CONTROL');
  ok(a.length >= 2 && JSON.stringify(a) === JSON.stringify(b), it.id + ' 집단 공통 발문 후보');
}
let r = E.onSubmit(null, {state:'PARTIAL',misc:null,missing:[]}, {stage:'Reflect',itemId:'L1RF01',group:'EXPERIMENT'});
ok(!r.out.length, '제출만으로 지원 질문 자동 제공 금지');
let first = E.onHelp(r.rec, {stage:'Reflect',itemId:'L1RF01',group:'EXPERIMENT'});
ok(first.rec.level === 1 && first.rec.supportCount === 1, '최초 도움 요청은 1수준');
ok(E.onHelp(first.rec, {stage:'Reflect',itemId:'L1RF01',group:'EXPERIMENT'}).out[0].kind === 'system', '재응답 없이 연속 도움 요청 불가');
r = E.onSubmit(first.rec, {state:'PARTIAL',misc:null,missing:[]}, {stage:'Reflect',itemId:'L1RF01',group:'EXPERIMENT'});
const next = E.onHelp(r.rec, {stage:'Reflect',itemId:'L1RF01',group:'EXPERIMENT'});
ok(next.rec.level === 1 && next.rec.supportCount === 2, '재응답 후 2차 지원도 같은 1수준');
ok(E.onHelp(r.rec, {stage:'Reflect',itemId:'L1RF01',group:'CONTROL'}).out.some(x=>x.kind==='request'), '통제집단 교사 도움 요청 대기열 생성');
ok(C.BANK.length === 396, '새 메타인지 발문은행 396개');
ok(new Set(C.BANK.map(b => b.id)).size === 396, '발문 ID 중복 없음');
ok(C.BANK.every(b => b.level === 1 && b.type === '메타인지' && !b.group), '발문 한 유형 한 수준 두 집단 공통');
ok(C.BANK.every(b => !E.leakCheck(b.item, b.text)), '기존 자동 누출 탐지 규칙에 걸린 발문 없음');
const active = C.ITEMS.filter(it => !it.archived);
ok(active.length === 24 && active.every(it => C.BANK.filter(b => b.item === it.id).length >= 16), '활성 24문항에 16개 이상 후보');
let nextRec = E.onSubmit(null,{state:'PARTIAL',misc:null,missing:[]},{stage:'Reflect',itemId:'L2RF03',group:'EXPERIMENT'}).rec;
const history = [];
for(let i=0;i<16;i++){
  const x=E.onHelp(nextRec,{stage:'Reflect',itemId:'L2RF03',group:'EXPERIMENT'});
  history.push(x.out[0].entryId);
  nextRec=E.onSubmit(x.rec,{state:'PARTIAL',misc:null,missing:[]},{stage:'Reflect',itemId:'L2RF03',group:'EXPERIMENT'}).rec;
}
ok(new Set(history).size===16,'반복 질문 16회 서로 다른 발문 선택');
console.log('PASS ' + passes + ': 연구설계 회귀검사(프로토타입 논리 수준, 실제 DB 및 화면 부하시험 별도 필요)');
