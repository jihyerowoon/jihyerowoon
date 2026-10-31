/* 교사의 즉석 메타인지 질문 안전점검.
 * 자동 규칙만으로 내용타당도가 입증되지 않는다.
 * 통과한 자유 발문은 모두 연구자 사후검수 대상.
 */
'use strict';
function validateTeacherQuestion(raw, itemId, engine) {
  const text=String(raw||'').trim().replace(/\s+/g,' ');
  if (!text || text.length<7 || text.length>130) return {ok:false,reason:'length'};
  if (!/(\?|？|까요|나요|니\?|볼래|해볼래|생각해|찾아볼|확인해|설명해|말해볼|적어볼)/.test(text)) return {ok:false,reason:'not_question'};
  if (/\d/.test(text)) return {ok:false,reason:'number_in_prompt'};
  if (/(정답은|답은|답이|맞았|맞아요|틀렸|틀려요|정답이다|공식은|공식을 쓰|계산해 보면|따라서|결과는|이등분하니까|180도니까)/.test(text)) return {ok:false,reason:'direct_hint'};
  if (/\b(?:SSS|SAS|ASA)\b/i.test(text)) return {ok:false,reason:'named_solution'};
  if (engine && engine.leakCheck(itemId,text)) return {ok:false,reason:'answer_leak'};
  return {ok:true,text,kind:'메타인지',level:1,review_required:true,rule_version:'teacher_custom_v1'};
}
module.exports={validateTeacherQuestion};
