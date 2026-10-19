// 엔진 시험: 1차시(삼각형의 합동)·2차시(평행사변형의 성질) 문항 판정, 수준 전환 규칙(07 QA T01–T23에 맞춘 시나리오), 발문 은행 무결성
const path = require('path');
const C = require(path.resolve(process.argv[2], 'content.js'));
const E = require(path.resolve(process.argv[2], 'engine.js'));

let pass = 0, fail = 0; const failures = [];
function ok(cond, name, extra) { if (cond) pass++; else { fail++; failures.push(name + (extra ? '  → ' + JSON.stringify(extra) : '')); } }
const S = { fadingPairs: true };
function judge(item, fields, group = 'EXPERIMENT', sel = {}) { return E.judgeRule(item, group, fields, sel, S); }
function submit(rec, item, fields, group = 'EXPERIMENT', recs = {}) {
  const r = judge(item, fields, group);
  const j = E.combine(item, group, r, null, false);
  return Object.assign(E.onSubmit(rec, j, { stage: E.ITEM[item].stage, itemId: item, group, settings: S, recs }), { j });
}
function help(rec, item, group = 'EXPERIMENT') { return E.onHelp(rec, { stage: E.ITEM[item].stage, itemId: item, group }); }
const sup = (res) => res.out.filter(o => o.kind === 'support');
const noLeak = (item, res) => sup(res).every(o => !E.leakCheck(item, o.text));
const noSignal = (res) => sup(res).every(o => !/(정답이에요|맞아요|틀렸|잘했|정확해요)/.test(o.text) || o.entryId === 'C-ANSWER_REQUEST');
const J = (it, f, g) => judge(it, f, g).state;

// ---------- 구조 ----------
ok(C.ITEMS.length === 28 && C.ITEMS.filter(i => i.lesson === 1).length === 14 && C.ITEMS.filter(i => i.lesson === 2).length === 14, '문항 28개(1·2차시 14개씩)');
ok(new Set(C.ITEMS.map(i => i.id)).size === C.ITEMS.length && C.ITEMS.every(i => new RegExp('^L' + i.lesson).test(i.id)), '문항 ID는 차시 번호로 시작하고 겹치지 않음');
ok(C.LESSONS[1].min.reduce((a, b) => a + b) === 60 && C.LESSONS[1].min.join() === '2,2,16,19,9,12', '1차시 60분(2·2·16·19·9·12)');
ok(C.LESSONS[2].min.reduce((a, b) => a + b) === 54 && C.LESSONS[2].min.join() === '2,2,12,19,9,10', '2차시 54분(2·2·12·19·9·10)');
ok(C.STAGES.map(s => s.cap).join() === '2,2,4,4,3,2' && C.STAGES.map(s => s.auto).join() === 'false,false,true,true,true,true', '단계 지원 상한·자동 확인은 이전 판과 같음');
ok(E.itemsForStage('Reflect', 'EXPERIMENT', S, 1).map(i => i.id).join() === 'L1RF01,L1RF02,L1RF03' && E.itemsForStage('Reflect', 'CONTROL', S, 2).every(i => !i.fixedAI), '차시별 문항, 통제집단에는 AI의 설명 없음');
ok(['L1RF01', 'L1RF02', 'L1RF03', 'L2RF01', 'L2RF02', 'L2RF03'].every(id => E.resolveItem(id, 'EXPERIMENT', S).fixedAI && E.resolveItem(id, 'EXPERIMENT', S).fields.some(f => f.key === 'verdict')), '실험집단 Reflect 6문항: AI의 설명 + 판단(옳다/일부만/다 틀리다)');
ok(C.ITEMS.filter(i => i.fig).every(i => C.FIGS[i.fig]) && Object.values(C.PROBLEMS).every(p => C.FIGS[p.fig]), '문제 그림 연결');
const fs = require('fs');
ok(Object.values(C.FIGS).every(f => fs.existsSync(path.resolve(process.argv[2], '..', 'public', f.file))), '문제 그림 파일 있음');
ok(C.MATERIALS.every(m => fs.existsSync(path.resolve(process.argv[2], '..', 'public', m.file)) && fs.existsSync(path.resolve(process.argv[2], '..', 'public', m.thumb))), '개념 자료 파일 있음');
ok(C.MATERIALS.filter(m => m.lesson === 1).length === 2 && C.MATERIALS.filter(m => m.lesson === 2).length === 3, '개념 자료: 1차시 2장, 2차시 3장');
ok(Object.values(C.RUBRIC).every(r => r.draft === true) && Object.keys(C.RUBRIC).length === 28, '정답 기준 28문항 모두 초안 표시(연구자 검토 필요)');

// ---------- 1차시 판정 ----------
// T01: 정답 + 근거 → 수준0
let r = submit(null, 'L1RD02', { answer: '2,5', work: 'ㄱ과 ㅁ은 세 변의 길이가 각각 같아서 SSS 합동, ㄷ의 나머지 각은 55°라서 ㄹ과 ASA 합동' });
ok(r.j.state === 'CLEAR_INDEPENDENT' && r.rec.level === 0 && r.rec.performance === 'INDEPENDENT_SUCCESS', 'T01 개념확인 정답+근거 → 수준0, 독립 성공', r.j);
// T02: 틀린 짝 → 수준1, 정답 없음
r = submit(null, 'L1RD02', { answer: '1,5', work: '' });
ok(r.j.state === 'MISAPPLIED_PROPERTY' && r.rec.level === 1 && noLeak('L1RD02', r), 'T02 틀린 짝 → 수준1, 정답 노출 없음', [r.j, sup(r)[0]]);
// T03: 정답이지만 근거 없음
r = submit(null, 'L1RD02', { answer: '2,5', work: '' });
ok(r.j.state === 'CORRECT_NO_REASON' && r.rec.level === 1 && r.rec.status !== 'clear' && /근거|조건/.test(sup(r)[0].text), 'T03 근거 없음 → 수준1, 근거 질문', [r.j, sup(r)[0]]);
r = submit(null, 'L1RD02', { answer: '2', work: 'SSS' });
ok(r.j.state === 'PARTIAL' && r.j.misc === 'missing_choice' && /다시 확인/.test(sup(r)[0].text), '한 짝만 고름 → 나머지 확인 질문', sup(r)[0]);
// T05: Reflect 무비판 수용
r = submit(null, 'L1RF01', { verdict: 'right', reason: 'AI 말이 맞아요' });
ok(r.j.state === 'REFLECT_UNCRITICAL' && r.rec.level === 1 && noSignal(r) && !/ASA|맞꼭지각/.test(sup(r)[0].text), 'T05 L1RF01 SAS 수용 → 수준1, 정답·정오 예고 없음', sup(r)[0]);
r = submit(null, 'L1RF01', { verdict: 'wrong', reason: '∠A=∠C, AO=CO이고 맞꼭지각 ∠AOB=∠COD도 같으니까 ASA 합동이다' });
ok(r.j.state === 'CLEAR_INDEPENDENT' && r.rec.level === 0, 'T07 L1RF01 ASA·맞꼭지각으로 판단 → 개입 중단', r.j);
ok(J('L1RF01', { verdict: 'partly', reason: '주어진 조건은 맞지만 SAS가 아니라 맞꼭지각을 이용한 ASA 합동' }) === 'CLEAR_INDEPENDENT', 'L1RF01 일부만 옳다도 인정');
ok(J('L1RF01', { answer: 'ASA 합동', reason: '∠A=∠C, AO=CO, ∠AOB=∠COD (맞꼭지각)' }, 'CONTROL') === 'CLEAR_INDEPENDENT', '통제 L1RF01 ASA');
ok(J('L1RF01', { answer: 'SAS', reason: '∠A=∠C, AO=CO' }, 'CONTROL') === 'MISAPPLIED_PROPERTY', '통제 L1RF01 SAS 오개념');
ok(J('L1RF02', { verdict: 'partly', reason: 'SSS 합동은 맞지만 ①과 ④는 맞고 ③과 ⑤는 대응각이 아니라서 옳지 않다' }) === 'CLEAR_INDEPENDENT', 'L1RF02 일부만 옳다 + ③⑤ 근거');
r = submit(null, 'L1RF02', { verdict: 'wrong', reason: '③, ⑤가 옳지 않다. ∠ABD의 대응각은 ∠CBD이다' });
ok(r.j.state === 'PARTIAL' && r.j.misc === 'verdict_category' && /맞는 부분과 틀린 부분/.test(sup(r)[0].text), 'L1RF02 답은 찾았지만 판단 범주(다 틀리다)가 다름 → 일부, 판단 다시 보기', sup(r)[0]);
ok(J('L1RF02', { verdict: 'right', reason: 'SSS 합동 맞음' }) === 'REFLECT_UNCRITICAL', 'L1RF02 AI 수용');
ok(J('L1RF02', { answer: '2,3,5', reason: '③은 ∠ABD의 대응각이 ∠CBD라서, ⑤는 2∠ADB라서 틀리다. ②는 합동 기호가 아니다' }, 'CONTROL') === 'CLEAR_INDEPENDENT', '통제 L1RF02: ②를 함께 골라도 인정(연구자 확인 필요)');
ok(J('L1RF02', { answer: '2', reason: '' }, 'CONTROL') === 'MISAPPLIED_PROPERTY', '통제 L1RF02: AI와 같은 ②만');
r = submit(null, 'L1RF03', { verdict: 'right', reason: 'A와 D가 대응하므로 ∠A의 대응각은 ∠D, ∠B=180-(60+30)=90, ∠F=∠C=30' });
ok(r.j.state === 'CLEAR_INDEPENDENT', 'T09 L1RF03 옳은 AI 설명을 근거로 검증 → 충족(수용 아님)', r.j);
r = submit(null, 'L1RF03', { verdict: 'right', reason: 'AI가 맞다' });
ok(r.j.state === 'REFLECT_UNCRITICAL' && r.rec.level === 1 && !/D|90|30/.test(sup(r)[0].text.replace(/△ABC≡△DEF/g, '')), 'T08 L1RF03 근거 없이 수용 → 수준1, 답 선제공 없음', sup(r)[0]);
ok(J('L1RF03', { verdict: 'partly', reason: '④도 맞다' }) === 'MISAPPLIED_PROPERTY', 'L1RF03 옳은 설명을 틀렸다고 판단');
ok(J('L1RF03', { answer: '2,3,5', reason: 'A↔D, B↔E, C↔F 대응이라서 DE=AB=5, ∠F=∠C=30' }, 'CONTROL') === 'CLEAR_INDEPENDENT', '통제 L1RF03');
ok(J('L1RF03', { answer: '1,2,3,5', reason: '' }, 'CONTROL') === 'MISAPPLIED_PROPERTY', '통제 L1RF03 그림 위치로 대응');
// Recite
r = submit(null, 'L1RC01', { text: '넓이가 같은 두 도형' });
ok(r.j.state === 'MISAPPLIED_PROPERTY' && r.rec.level === 1 && !E.leakCheck('L1RC01', sup(r)[0].text), 'T10 L1RC01 넓이만 같음 → 수준1, 뜻 대필 없음', sup(r)[0]);
r = submit(null, 'L1RC01', { text: '모양과 크기가 같아서 포개었을 때 완전히 겹치는 두 도형' });
ok(r.j.state === 'CLEAR_INDEPENDENT' && sup(r).every(o => o.level === 0), 'T11 L1RC01 뜻 → 추가 힌트 없음', r.j);
ok(J('L1RC01', { text: '두 도형을 겹쳤을 때 딱 맞는 것' }) === 'CLEAR_INDEPENDENT', 'L1RC01 겹쳐서 딱 맞음');
ok(J('L1RC02', { text: '합동인 두 도형을 포개었을 때 서로 겹치는 꼭짓점, 변, 각' }) === 'CLEAR_INDEPENDENT', 'L1RC02 대응의 뜻');
ok(judge('L1RC02', { text: 'A와 D, B와 E, C와 F' }).misc === 'examples_only', 'L1RC02 예만 씀 → 뜻 질문');
ok(J('L1RC03', { text: 'SSS는 세 변의 길이가 각각 같을 때, SAS는 두 변의 길이가 각각 같고 그 끼인각의 크기가 같을 때, ASA는 한 변의 길이가 같고 그 양 끝 각의 크기가 같을 때' }) === 'CLEAR_INDEPENDENT', 'L1RC03 세 조건');
ok(judge('L1RC03', { text: 'SSS, SAS, ASA' }).misc === 'names_only', 'L1RC03 이름만 → 뜻 덧붙이기');
ok(J('L1RC03', { text: '세 변이 같을 때, 두 변과 한 각이 같을 때' }) === 'MISAPPLIED_PROPERTY', 'L1RC03 끼인각 아님(SSA) 오개념');
ok(J('L1RC03', { text: '세 각의 크기가 같으면 합동' }) === 'MISAPPLIED_PROPERTY', 'L1RC03 세 각(AAA) 오개념');
// Review
ok(J('L1RV01', { text: '△ABC≡△EFD, ∠F=180-(60+40)=80이므로 AB=EF, BC=FD, ∠B=∠F라서 SAS 합동' }) === 'CLEAR_INDEPENDENT', 'L1RV01 대응 순서·SAS·근거');
ok(J('L1RV01', { text: '△BAC≡△FED, SAS 합동, ∠F=80도' }) === 'CLEAR_INDEPENDENT', 'L1RV01 같은 대응의 다른 순서도 인정');
ok(judge('L1RV01', { text: '△ABC≡△DEF SAS 합동' }).misc === 'corr_order', 'L1RV01 그림 위치대로 쓴 대응 → 대응 순서 오개념');
ok(judge('L1RV01', { text: '△ABC≡△EFD ASA 합동' }).misc === 'wrong_condition', 'L1RV01 합동조건 틀림');
r = submit(null, 'L1RV02', { text: '아직 모르겠다' });
ok(r.j.state === 'SELF_REPORT_UNCERTAIN' && r.rec.level === 1 && /헷갈/.test(sup(r)[0].text) && !/좋아|잘/.test(sup(r)[0].text), 'T12 L1RV02 아직 모르겠다 → 헷갈린 부분 특정, 긍정 강요 없음', sup(r)[0]);
r = submit(null, 'L1RV02', { text: '처음에는 그림의 모양만 보고 판단했어요. 지금은 주어진 조건을 먼저 보게 되었어요.' });
ok(r.j.state === 'INVALID_RESPONSE' && r.j.misc === 'copy' && sup(r)[0].entryId === 'C-COPY', 'L1RV02 예시를 그대로 베낌 → 내 말로 다시', sup(r)[0]);
r = submit(null, 'L1RV03', { text: '도움 없었음' });
ok(r.j.state === 'PARTIAL' && r.rec.level === 1 && /구체적/.test(sup(r)[0].text), 'T13 L1RV03 막연함 → 구체화만', [r.j, sup(r)[0]]);
ok(J('L1QU01', { text: '왜 SAS 합동일까?' }) === 'CLEAR_INDEPENDENT' && J('L1QU01', { text: 'SAS' }) === 'INVALID_RESPONSE', 'L1QU01 질문과 답 구별');
ok(J('L1PV01', { text: '두 삼각형은 합동이고 변의 길이가 같다' }) === 'CLEAR_INDEPENDENT', 'L1PV01 선행지식');
ok(J('L1RD01', { text: '합동: 모양과 크기가 같음, SSS SAS ASA' }) === 'CLEAR_INDEPENDENT', 'L1RD01 핵심 개념 메모');

// ---------- 2차시 판정 ----------
ok(J('L2RD02', { answer: '1,5', work: 'AB∥DC이므로 엇각 ∠BAO=∠DCO, ∠ABO=∠CDO이고 AB=CD라서 ASA 합동' }) === 'CLEAR_INDEPENDENT', 'L2RD02 정답·엇각·ASA');
r = submit(null, 'L2RD02', { answer: '2,3', work: '' });
ok(r.j.misc === 'circular' && /결론/.test(sup(r)[0].text) && noLeak('L2RD02', r), 'L2RD02 결론을 조건으로 고름 → 순환 논리 질문', sup(r)[0]);
ok(judge('L2RD02', { answer: '1,5', work: 'ASA' }).missing.join() === 'P_ALT', 'L2RD02 엇각 근거 빠짐');
r = submit(null, 'L2RF01', { answer: '2', verdict: 'right', reason: 'AI가 맞다' });
ok(r.j.state === 'REFLECT_UNCRITICAL' && !/75|105/.test(sup(r)[0].text), 'L2RF01 AI의 70° 수용 → 무비판 수용, 답 없음', sup(r)[0]);
ok(J('L2RF01', { answer: '3', verdict: 'wrong', reason: 'AD=AE라서 이등변삼각형, ∠ADE=∠AED=75, 이웃한 두 각의 합 180이므로 ∠DAB=105, 105-30=75' }) === 'CLEAR_INDEPENDENT', 'L2RF01 75°·이등변·이웃각');
ok(J('L2RF01', { answer: '3', verdict: 'partly', reason: '이웃한 두 각의 합이 180°인 건 맞지만 ∠ADE는 이등변삼각형의 밑각이라 75' }) === 'CLEAR_INDEPENDENT', 'L2RF01 일부만 옳다도 인정');
ok(J('L2RF01', { answer: '3', reason: '밑각이 75이고 180-75=105, 105-30=75' }, 'CONTROL') === 'CLEAR_INDEPENDENT' && judge('L2RF01', { answer: '2', reason: '30도라서' }, 'CONTROL').misc === 'base_angle', '통제 L2RF01');
ok(J('L2RF02', { answer: '4,5', verdict: 'partly', reason: '대각선이 서로를 이등분해서 OD=4, 둘레는 4+3+5=12' }) === 'CLEAR_INDEPENDENT', 'L2RF02 ④⑤·일부만 옳다');
ok(J('L2RF02', { answer: '4', verdict: 'right', reason: '' }) === 'REFLECT_UNCRITICAL' && judge('L2RF02', { answer: '4', reason: 'OD=4' }, 'CONTROL').misc === 'missing_choice', 'L2RF02 ⑤를 빠뜨림');
ok(judge('L2RF02', { answer: '4,5', verdict: 'wrong', reason: 'OD=4, 둘레 12' }).misc === 'verdict_category', 'L2RF02 판단 범주 다름');
ok(J('L2RF03', { answer: '3', verdict: 'partly', reason: '이웃한 두 각의 합 180, ∠A=96 ∠C=∠A 마주 보는 각' }) === 'CLEAR_INDEPENDENT', 'L2RF03 96°');
ok(J('L2RF03', { answer: '1', verdict: 'wrong', reason: '84' }) === 'REFLECT_UNCRITICAL' && judge('L2RF03', { answer: '1', reason: '84' }, 'CONTROL').misc === 'adj_opp', 'L2RF03 AI와 같은 84°');
ok(J('L2RC01', { text: '두 쌍의 대변이 각각 평행한 사각형' }) === 'CLEAR_INDEPENDENT' && judge('L2RC01', { text: '한 쌍의 대변이 평행한 사각형' }).misc === 'trapezoid', 'L2RC01 뜻·사다리꼴 오개념');
r = submit(null, 'L2RC02', { text: '두 대각선의 길이가 같다' });
ok(r.j.state === 'MISAPPLIED_PROPERTY' && /전체 길이/.test(sup(r)[0].text) && !E.leakCheck('L2RC02', sup(r)[0].text), 'L2RC02 대각선 길이 같음 → 전체 길이인지 확인, 대필 없음', sup(r)[0]);
ok(J('L2RC02', { text: '마주 보는 두 변의 길이는 같고, 마주 보는 각의 크기는 같고, 두 대각선은 서로를 이등분한다' }) === 'CLEAR_INDEPENDENT', 'L2RC02 세 성질');
ok(J('L2RC02', { text: '두 쌍의 대변의 길이는 각각 같다. 두 쌍의 대각의 크기는 각각 같다. 두 대각선은 서로 다른 것을 이등분한다' }) === 'CLEAR_INDEPENDENT', 'L2RC02 교재 표현');
ok(J('L2RC02', { text: '마주 보는 각이 같다' }) === 'PARTIAL', 'L2RC02 한 성질만');
ok(J('L2RC03', { text: 'AB=CD, AD=BC, ∠A=∠C, ∠B=∠D, AO=CO, BO=DO' }) === 'CLEAR_INDEPENDENT', 'L2RC03 기호');
ok(J('L2RC03', { text: 'AB//CD, AD//BC, ∠A=∠C' }) === 'PARTIAL' && J('L2RC03', { text: 'AC=BD' }) === 'MISAPPLIED_PROPERTY', 'L2RC03 일부·오개념');
ok(J('L2RV01', { text: '△OCD 넓이가 30이니까 평행사변형 넓이는 120, 높이는 10이니까 AB=12, AE=12-9=3cm' }) === 'CLEAR_INDEPENDENT', 'L2RV01 3cm·근거');
ok(J('L2RV01', { text: 'AE=3cm' }) === 'CORRECT_NO_REASON' && judge('L2RV01', { text: 'AE=15' }).misc === 'height_5', 'L2RV01 근거 없음·높이 5 오개념');
ok(J('L2QU01', { text: '평행사변형의 대각선은 왜 서로 이등분할까?' }) === 'CLEAR_INDEPENDENT', 'L2QU01 질문');
// 2차시 조작 도형 선택
const P = (t, sel) => E.detect(t, sel);
ok(P('두 선분의 길이가 같아요', ['half:AO', 'half:OC']).BISECT_ONE, '도형 선택 + “두 선분의 길이가 같아요” → AC 이등분');
ok(P('AC=BD').M_DIAG_EQUAL && !P('AC=BD').P_DIAG_BISECT && !P('대각선의 길이는 같지 않다').M_DIAG_EQUAL, '대각선 길이 같음 오개념·부정문 구분');
ok(E.numVal('180-68') === 112 && E.numVal('9/2') === 4.5, '수식 값 계산');
ok(E.circNums('①과 ④는 맞고 ③, 5번은 틀림').join() === '1,3,4,5' && E.classifyOpts('①과 ④는 맞고 ③과 ⑤는 틀리다').wrong.join() === '3,5', '보기 번호 읽기·맞다/틀리다 나누기');

// ---------- 공통 규칙 ----------
// T15: 답만 요청
r = submit(null, 'L1RD02', { work: '답만 알려줘' });
ok(r.j.state === 'INVALID_RESPONSE' && r.rec.level === 1 && sup(r)[0].entryId === 'C-ANSWER_REQUEST', 'T15 답만 알려줘 → 수준1, 답변 차단', sup(r)[0]);
// T16
r = help(null, 'L1RD02');
ok(sup(r)[0].level === 0 && sup(r)[0].entryId === 'C-PRE_SUBMIT', 'T16 제출 전 도움 요청 → 수준0', sup(r)[0]);
// T17: 수준3에서 해결 → ASSISTED, 추가 상향 금지
let rec = E.newRec();
r = submit(rec, 'L2RF03', { answer: '5', reason: '' }, 'EXPERIMENT'); rec = r.rec;
r = submit(rec, 'L2RF03', { answer: '5', verdict: 'wrong', reason: '모름' }); rec = r.rec;
r = help(rec, 'L2RF03'); rec = r.rec; ok(rec.level === 2, 'T17 준비: 재수행 후 도움 → 수준2', rec);
r = submit(rec, 'L2RF03', { answer: '4', verdict: 'wrong', reason: '?' }); rec = r.rec;
r = help(rec, 'L2RF03'); rec = r.rec; ok(rec.level === 3, 'T17 준비: 재수행 후 도움 → 수준3', rec);
r = submit(rec, 'L2RF03', { answer: '3', verdict: 'partly', reason: '이웃한 두 각의 합이 180°라서 ∠A=96°, ∠C는 ∠A와 마주 보는 각이라 96°' }); rec = r.rec;
ok(rec.status === 'clear' && rec.performance === 'ASSISTED_SUCCESS' && rec.level === 0 && rec.maxLevel === 3, 'T17 수준3에서 해결 → ASSISTED_SUCCESS, 중단', rec);
r = help(rec, 'L2RF03'); ok(r.rec.level === 0 && sup(r)[0].entryId === 'C-ALREADY_DONE', 'T17 해결 후 추가 상향 없음', sup(r)[0]);
// T18: 짝 문항 지원 감소 관찰
let recs = { L1RD02: Object.assign(E.newRec(), { supportCount: 2, status: 'clear' }) };
r = submit(null, 'L1RF01', { verdict: 'wrong', reason: '맞꼭지각이 같아서 ASA 합동' }, 'EXPERIMENT', recs);
ok(r.rec.fading === 'DECREASED' && r.rec.performance === 'INDEPENDENT_SUCCESS', 'T18 1차시 짝 문항 독립 성공 → DECREASED', r.rec);
recs = { L2RD02: Object.assign(E.newRec(), { supportCount: 1, status: 'clear' }) };
r = submit(null, 'L2RF02', { answer: '4,5', verdict: 'partly', reason: '대각선이 서로를 이등분해서 OD=4, 둘레는 12' }, 'EXPERIMENT', recs);
ok(r.rec.fading === 'DECREASED', 'T18 2차시 짝 문항 독립 성공 → DECREASED', r.rec);
// T19: AI 2회 불일치 → 보류
let j = E.combine('L1RC02', 'EXPERIMENT', judge('L1RC02', { text: '서로 관계가 있는 것' }), [{ state: 'PARTIAL', missing: [] }, { state: 'CLEAR_INDEPENDENT', missing: [] }], true);
ok(j.state === 'AMBIGUOUS' && j.needsReview && j.source === 'hold', 'T19 AI 2회 불일치 → 보류, 사람 검토', j);
r = E.onSubmit(null, j, { stage: 'Recite', itemId: 'L1RC02', group: 'EXPERIMENT', settings: S });
ok(r.rec.level === 1 && sup(r)[0].entryId === 'L1RC02-L1-AMBIGUOUS-a', 'T19 정답 단정 없이 의미 확인 질문', sup(r)[0]);
// T20: 문장 다듬기 검사
let chk = E.checkOutput('답은 75°예요. 다시 확인해 볼까요?', C.BANK.find(b => b.item === 'L2RF01' && b.level === 2).text, '70', 'L2RF01');
ok(!chk.ok, 'T20 정답 숫자 포함 문장 차단', chk);
chk = E.checkOutput('정답이에요! 다음으로 가요.', '그 답을 정할 때 사용한 성질과 계산을 적어 볼까요?', '', 'L2RF01');
ok(!chk.ok && chk.reason === 'correctness_signal', 'T20 정오 신호 차단', chk);
chk = E.checkOutput('ASA 합동을 떠올려 볼까요?', '그림에 같다고 표시된 것이 무엇인지 먼저 적어 볼까요?', 'SAS', 'L1RF01');
ok(!chk.ok, 'T20 은행 문장에 없는 합동조건(ASA) 추가 차단', chk);
chk = E.checkOutput('‘SAS 합동’이라고 쓴 근거를 그림의 각과 변으로 적어 볼까요?', C.BANK.find(b => b.id === 'L1RF01-L1-CORRECT_NO_REASON-a').text, 'SAS 합동', 'L1RF01');
ok(chk.ok, 'T20 학생 표현 인용은 허용', chk);
// T21: 통제집단은 AI 개입 0회
r = submit(null, 'L1RD02', { answer: '1,5' }, 'CONTROL');
ok(r.out.length === 0, 'T21 통제집단 제출 시 AI 지원 없음', r.out);
r = help(r.rec, 'L1RD02', 'CONTROL');
ok(r.out.some(o => o.kind === 'request') && sup(r).length === 0, 'T21 통제집단 도움 요청 → 교사 요청만', r.out);
let opt = E.teacherOptions(E.newRec(), 'Read');
ok(opt.preSubmitOnly && opt.levels.join() === '0', 'T21 교사도 제출 전에는 수준0만', opt);
opt = E.teacherOptions(Object.assign(E.newRec(), { attempts: 1, level: 1 }), 'Recite');
ok(opt.levels.join() === '1,2,3' && opt.suggested === 2, 'T21 교사 선택지 단계 상한 적용', opt);
// T22: 수준4 이후 계속 오류 → 미해결
rec = Object.assign(E.newRec(), { attempts: 4, level: 4, maxLevel: 4, supportCount: 4, lastSupportAttempt: 4 });
r = submit(rec, 'L2RF01', { answer: '1', verdict: 'wrong', reason: '모르겠어요' });
ok(r.rec.status === 'unresolved' && r.rec.performance === 'UNRESOLVED' && !/75/.test(sup(r)[0].text), 'T22 수준4 이후 오류 → UNRESOLVED, 최종 답 없음', [r.rec, sup(r)[0]]);
// T23
r = E.onStageClose(E.newRec(), { group: 'EXPERIMENT', hasDraft: true });
ok(r.rec.status === 'incomplete' && r.events[0].type === 'TIMEOUT' && r.events[0].incomplete, 'T23 미제출 → 임시저장분 미완료 기록', r);

// ---------- 발문 은행 무결성 ----------
const ids = new Set(); const dup = [];
C.BANK.forEach(b => { if (ids.has(b.id)) dup.push(b.id); ids.add(b.id); });
ok(!dup.length, '발문 ID 중복 없음', dup);
const cap = {}; C.STAGES.forEach(s => cap[s.id] = s.cap);
ok(C.BANK.every(b => E.ITEM[b.item] && b.level <= cap[E.ITEM[b.item].stage]), '모든 발문이 있는 문항에 붙어 있고 단계 상한을 넘지 않음');
ok(C.BANK.every(b => !/(정답이에요|맞아요|틀렸|잘했|훌륭|정확해요)/.test(b.text)), '정오 신호 발문 없음');
ok(C.BANK.every(b => /요[?.]?$|요\?$/.test(b.text.trim())), '발문은 모두 ‘-요’체', C.BANK.filter(b => !/요[?.]?$/.test(b.text.trim())).map(b => b.id));
ok(C.BANK.filter(b => /RC/.test(b.item)).every(b => !E.leakCheck(b.item, b.text)), 'Recite 발문에 뜻·성질 정답 노출 없음');
ok(C.BANK.every(b => !E.leakCheck(b.item, b.text) || /-L4-/.test(b.id)), '수준4 밖에서는 정답 노출 없음', C.BANK.filter(b => E.leakCheck(b.item, b.text) && !/-L4-/.test(b.id)).map(b => b.id));
ok(C.BANK.every(b => !/(^|[^0-9])(75|96|12cm)/.test(b.text) || /-L4-/.test(b.id)), '2차시 Reflect 최종 값이 발문에 없음');
const missingCells = [];
['EXPERIMENT', 'CONTROL'].forEach(g => C.ITEMS.forEach(it => {
  for (let l = 1; l <= cap[it.stage]; l++) {
    const pool = C.BANK.filter(b => b.item === it.id && b.level === l && (!b.group || b.group === g) && b.state === '*');
    if (pool.length < 2) missingCells.push(g + ' ' + it.id + ' L' + l + ' (' + pool.length + ')');
  }
}));
ok(!missingCells.length, '모든 문항·수준·집단에 일반 발문 2개(재표현용) 이상', missingCells);
ok(C.BANK.filter(b => b.group === 'CONTROL').every(b => !/AI/.test(b.text)) && C.BANK.filter(b => !b.group).every(b => !/AI의 설명|AI가/.test(b.text)), '통제집단에 갈 수 있는 발문에 AI 언급 없음');
// 판정 결과마다 고를 발문이 있다(빈 지원 없음)
const states = Object.keys(C.STATES), noEntry = [];
['EXPERIMENT', 'CONTROL'].forEach(g => C.ITEMS.forEach(it => states.forEach(st => { for (let l = 1; l <= cap[it.stage]; l++) { const e = E.pickEntry(it.id, l, st, 'x', ['C_SSS'], g, 'a', null) || E.pickEntry(it.id, l, '*', null, null, g, 'a', null); if (!e) noEntry.push(g + ' ' + it.id + ' L' + l + ' ' + st); } })));
ok(!noEntry.length, '모든 문항·상태·수준에서 발문 선택 가능', noEntry.slice(0, 5));

// ---------- 재발 방지 ----------
{
  // 답 요청 반복: 공통 응답은 첫 지원에만, 같은 문장 반복 없음, 기록된 수준 = 실제 발문 수준
  const ctx = { stage: 'Read', itemId: 'L1RD02', group: 'EXPERIMENT', settings: S, recs: {} };
  const ask = () => E.combine('L1RD02', 'EXPERIMENT', judge('L1RD02', { work: '답 알려줘' }), null, false);
  let rc = E.newRec(); const seen = []; let x;
  for (let k = 0; k < 3; k++) { x = E.onSubmit(rc, ask(), ctx); rc = x.rec; seen.push(...sup(x)); x = E.onHelp(rc, ctx); rc = x.rec; seen.push(...sup(x)); }
  const sameAsPrev = seen.filter((o, i) => i > 0 && o.entryId === seen[i - 1].entryId);
  ok(seen[0].entryId === 'C-ANSWER_REQUEST' && !sameAsPrev.length, '답 요청 반복: 공통 응답은 첫 지원에만, 같은 문장 반복 없음', seen.map(o => o.entryId));
  const mismatch = seen.filter(o => o.level >= 2 && !new RegExp('-L' + o.level + '-').test(o.entryId));
  ok(!mismatch.length && rc.level === 3, '답 요청 반복: 기록된 수준 = 실제 발문 수준', seen.map(o => o.level + ':' + o.entryId));
  // 뜻 확인 공통 응답 뒤 도움 요청 → 문항 발문으로 재표현
  const c2 = { stage: 'Recite', itemId: 'L2RC02', group: 'EXPERIMENT', settings: S, recs: {} };
  const r2 = E.onSubmit(E.newRec(), E.combine('L2RC02', 'EXPERIMENT', judge('L2RC02', { text: '그냥 그렇게 생각함' }), null, false), c2);
  const h2 = E.onHelp(r2.rec, c2);
  ok(sup(r2)[0].entryId === 'L2RC02-L1-AMBIGUOUS-a' && sup(h2)[0].entryId !== sup(r2)[0].entryId && /^L2RC02-L1-/.test(sup(h2)[0].entryId), '뜻 확인 뒤 재표현은 다른 문장', [sup(r2)[0].entryId, sup(h2)[0].entryId]);
  const pr = E.buildJudgePrompt('L1RF01', 'EXPERIMENT', { verdict: 'partly', reason: 'x' }, {}, S);
  ok(pr.indexOf('[학생이 검토하는 AI의 설명]') >= 0 && pr.indexOf('일부만 옳다') >= 0 && pr.indexOf('[그림]') >= 0 && pr.indexOf('ASA') >= 0 && pr.indexOf('1차시 · 삼각형의 합동') >= 0, 'AI 판정 프롬프트: 차시·그림·AI의 설명·판단·기준');
  const pr2 = E.buildJudgePrompt('L2RV01', 'EXPERIMENT', { text: '3' }, {}, S);
  ok(pr2.indexOf('[문제] 그림과 같은 평행사변형') >= 0 && pr2.indexOf('[문제 그림]') >= 0 && pr2.indexOf('[도형에서 선택한 요소]') >= 0, 'AI 판정 프롬프트: Review는 처음 문제와 그림을 함께');
  ok(E.buildJudgePrompt('L1RV01', 'EXPERIMENT', { text: '3' }, {}, S).indexOf('[도형에서 선택한 요소]') < 0, '1차시는 조작 도형 선택을 프롬프트에 넣지 않음');
  ok(E.PROP_KEYS.indexOf('C_SSS') >= 0 && E.parseJudge({ state: 'PARTIAL', missing: ['C_VERT', 'NOPE'] }).missing.join() === 'C_VERT', 'AI 응답의 빠진 성질 코드 정리');
}

console.log('발문 수: ' + C.BANK.length + ' (1차시 ' + C.BANK.filter(b => b.lesson === 1).length + ', 2차시 ' + C.BANK.filter(b => b.lesson === 2).length + ', 공통 ' + Object.keys(C.COMMON).length + ')');
console.log(pass + ' 통과, ' + fail + ' 실패');
failures.forEach(f => console.log('  ✗ ' + f));
process.exit(fail ? 1 : 0);
