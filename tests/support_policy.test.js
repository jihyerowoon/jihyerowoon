'use strict';
const assert=require('node:assert/strict');
const E=require('../lib/engine');
const P=require('../lib/support_policy');
let n=0;
function check(ok,label){assert.ok(ok,label);n++;}
const good=[
  '왜 그렇게 생각했는지 말해볼래?',
  '그림에서 네가 사용한 조건을 직접 찾아볼래?',
  '처음 생각과 지금 생각이 어떻게 다른지 말해줄래?',
  '네 풀이에서 아직 확실하지 않은 부분을 찾아볼까?'
];
for(const q of good)check(P.validateTeacherQuestion(q,'L2RF03',E).ok,'safe: '+q);
const bad=[
  '정답은 96도다.',
  'ASA 합동을 써볼래?',
  '그림에서 75를 넣어 계산해 볼까?',
  '다음 계산 순서는 이렇게 해.',
  '',
  '맞아요. 아주 잘했어요!'
];
for(const q of bad)check(!P.validateTeacherQuestion(q,'L2RF03',E).ok,'block: '+q);
let audit=E.fidelity([
{event_type:'SUPPORT_SENT',item_id:'L1RF01',group:'CONTROL',support_provider:'TEACHER',support_level_after:1,support_type:'메타인지',support_trigger:'STUDENT_REQUEST',bank_id:'TEACHER_FREEFORM',extra:{teacher_question_mode:'FREEFORM',rule_validation:'PASS',review_required:true,delivery_mode:'TEXT'}},
{event_type:'SUPPORT_SENT',item_id:'L1RF02',group:'CONTROL',support_provider:'TEACHER',support_level_after:1,support_type:'메타인지',support_trigger:'STUDENT_REQUEST',bank_id:'L1RF02-MC26',extra:{teacher_question_mode:'BANK',delivery_mode:'TEXT_AND_PRIVATE_ORAL'}}
]);
check(audit.teacherFreeformQuestions===1,'freeform tracked');
check(audit.teacherBankQuestions===1,'bank tracked');
check(audit.teacherFreeformReviewRequired===1,'freeform human review required');
check(audit.teacherPrivateOralReports===1,'private oral tracked as self report');
check(audit.unapprovedText===0,'rule-passing freeform not automatically considered protocol violation');
check(audit.levelViolations===0&&audit.typeViolations===0,'one type one intensity');
console.log('PASS '+n+': 교사 직접 질문·은행 질문·구두전달 자기보고 검사 (실제 DB와 음성 검증 별도)');
