/* 2026-10-23 연구용 발문은행 선택 고정: 이 테스트는 실제 Node 환경에서 실행해 기록할 것. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../lib/content');
const E=require('../lib/engine');
const active=C.ITEMS.filter(it=>!it.archived).map(it=>it.id);
assert.equal(active.length,24,'1~2차시 활성 문항 24개');
assert.equal(C.BANK.length,540,'발문 후보 540개');
assert.equal(new Set(C.BANK.map(e=>e.id)).size,540,'발문 ID 중복 금지');
assert.equal(C.BANK.filter(e=>e.src==='EASY_DRAFT_20261023').length,144,'쉬운 후보 144개');
for(const id of active) {
  assert.equal(C.BANK.filter(e=>e.item===id).length,[ 'L1RF01','L1RF02','L1RF03','L2RF01','L2RF02','L2RF03' ].includes(id)?24:22,'문항별 수');
  assert.ok(E.bankFor(id,1,'EXPERIMENT').length>0);
  assert.ok(E.bankFor(id,1,'CONTROL').length>0);
}
for(const e of C.BANK) {
  assert.equal(e.level,1);assert.equal(e.type,'메타인지');assert.equal(e.group,null);
}
for(const e of C.BANK.filter(e=>e.src==='EASY_DRAFT_20261023')) {
  assert.ok(e.text.length<=78 && e.text.endsWith('?'));
  assert.equal(e.review_status,'RESEARCHER_REVIEW_REQUIRED');
  assert.ok(!/[0-9]/.test(e.text));
}
const st=fs.readFileSync(require.resolve('../lib/student'),'utf8');
assert.ok(!st.includes('ai.generateSupport('),'학생 지원 경로에서 실시간 생성 금지');
const staff=fs.readFileSync(require.resolve('../lib/staff'),'utf8');
assert.ok(staff.includes('emergency_reason_required'));
assert.ok(staff.includes('teacher_question_mode:\'FREEFORM\''));
const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
assert.ok(app.includes('sf-emergency-reason'));
console.log('PASS bank-only lock, 540 candidate rows, 144 easy drafts, emergency reason path');
