// 엔진 QA: 07 QA 시나리오 T01–T23 + 발문 은행 무결성 + 00 문서 동치 판정 예시
const path = require('path');
const C = require(path.resolve(process.argv[2], 'content.js'));
const E = require(path.resolve(process.argv[2], 'engine.js'));

let pass = 0, fail = 0; const failures = [];
function ok(cond, name, extra) { if (cond) pass++; else { fail++; failures.push(name + (extra ? '  → ' + JSON.stringify(extra) : '')); } }
const S = { fadingPairs: true, controlRF03: 'neutral' };
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

// T01
let r = submit(null, 'RD01', { angB: '112', angC: '68', angD: '112', work: '∠B는 ∠A와 이웃한 각이라 180-68=112, ∠C는 ∠A와 마주 보는 각이라 크기가 같아서 68, ∠D는 ∠B와 마주 보는 각' });
ok(r.j.state === 'CLEAR_INDEPENDENT' && r.rec.level === 0 && r.rec.performance === 'INDEPENDENT_SUCCESS', 'T01 RD01 정답+근거 → 수준0, 독립 성공', r.j);
// T02
r = submit(null, 'RD01', { angB: '68', angC: '68', angD: '68', work: '모두 68도' });
ok(r.j.state === 'MISAPPLIED_PROPERTY' && r.rec.level === 1 && r.rec.attempts === 1, 'T02 RD01 모두 68 → 수준1', r.j);
ok(sup(r)[0] && /위치|어디/.test(sup(r)[0].text), 'T02 위치 관계 확인 질문', sup(r)[0]);
// T03
r = submit(null, 'RD01', { angB: '112', angC: '68', angD: '112', work: '' });
ok(r.j.state === 'CORRECT_NO_REASON' && r.rec.level === 1 && r.rec.status !== 'clear', 'T03 근거 없음 → 수준1, 독립 성공 미확정', r.j);
ok(/성질|근거|어떻게/.test(sup(r)[0].text), 'T03 왜 그렇게 판단했는지 질문');
// T04
r = submit(null, 'RD02', { OC: '4.5', OD: '3', work: '' });
ok(r.j.state === 'MISAPPLIED_PROPERTY' && r.rec.level === 1, 'T04 RD02 OC/OD 바꿈 → 수준1', r.j);
ok(noLeak('RD02', r) && !/4\.5|=\s*3/.test(sup(r)[0].text), 'T04 결과값 누설 없음', sup(r)[0]);
// T05
r = submit(null, 'RF01', { use: 'accept', property: '', judgment: 'AI를 그대로 믿어요', final: '' });
ok(r.j.state === 'REFLECT_UNCRITICAL' && r.rec.level === 1, 'T05 RF01 무비판 수용 → 수준1', r.j);
ok(noSignal(r) && !/맞는 설명|타당/.test(sup(r)[0].text), 'T05 정오 예고 없음', sup(r)[0]);
// T06
r = submit(null, 'RF02', { use: 'accept', property: '', judgment: 'BO=OD=7 맞아요', final: '' });
ok(r.j.state === 'REFLECT_UNCRITICAL' && r.rec.level === 1, 'T06 RF02 BO=OD=7 수용 → 수준1', r.j);
ok(/AC|BD/.test(sup(r)[0].text) && !E.leakCheck('RF02', sup(r)[0].text), 'T06 AC·BD 정보 비교 질문, 오류 위치 누설 없음', sup(r)[0]);
// T07
r = submit(null, 'RF02', { use: 'partial', property: '', judgment: 'AO=OC=7, BO=OD지만 숫자는 모름', final: '' });
ok(r.j.state === 'CLEAR_INDEPENDENT' && r.rec.level === 0 && r.rec.performance === 'INDEPENDENT_SUCCESS', 'T07 RF02 BO·OD 값 미정 판단 → 개입 중단', r.j);
// T08
r = submit(null, 'RF03', { use: 'accept', property: '', judgment: 'x=10 AI가 맞아요', final: 'x=10' });
ok(r.j.state === 'REFLECT_UNCRITICAL' && r.rec.level === 1, 'T08 RF03 x=10 수용 → 수준1', r.j);
ok(!/30/.test(sup(r)[0].text) && /각/.test(sup(r)[0].text), 'T08 x=30 선제공 없음, 각 위치 질문', sup(r)[0]);
// T09
r = submit(null, 'RF03', { use: 'reject', property: '', judgment: 'x=30, 이웃각 180', final: 'x=30' });
ok(r.j.state === 'CLEAR_INDEPENDENT' && r.rec.level === 0, 'T09 RF03 x=30·이웃각 180 → 개입 중단', r.j);
// T10
r = submit(null, 'RC03', { text: '두 대각선 길이가 같음' });
ok(r.j.state === 'MISAPPLIED_PROPERTY' && r.rec.level === 1, 'T10 RC03 대각선 길이 같음 → 수준1', r.j);
ok(/전체 길이/.test(sup(r)[0].text) && !E.leakCheck('RC03', sup(r)[0].text), 'T10 전체 길이인지 의미 확인, 설명 대필 없음', sup(r)[0]);
// T11
r = submit(null, 'RC03', { text: 'AO=OC BO=OD, 두 대각선이 O에서 만나서 각각 반으로 나뉘기 때문이다' });
ok(r.j.state === 'CLEAR_INDEPENDENT' && r.rec.level === 0 && sup(r).every(o => o.level === 0), 'T11 RC03 AO=OC BO=OD → 추가 힌트 없음', r.j);
// T12
r = submit(null, 'RV02', { text: '아직 모르겠다' });
ok(r.j.state === 'SELF_REPORT_UNCERTAIN' && r.rec.level === 1, 'T12 RV02 아직 모르겠다 → 수준1', r.j);
ok(/헷갈/.test(sup(r)[0].text) && !/긍정|좋아|잘/.test(sup(r)[0].text), 'T12 헷갈린 부분 특정, 긍정 강요 없음', sup(r)[0]);
// T13
r = submit(null, 'RV03', { text: '도움 없었음, 특별한 이유 없음' });
ok(r.j.state === 'PARTIAL' && r.rec.level === 1 && /구체적/.test(sup(r)[0].text), 'T13 RV03 도움 없었음 → 경험 구체화만', [r.j, sup(r)[0]]);
// T14
r = submit(null, 'RV04', { text: '다음에 잘할게요' });
ok(r.j.state === 'PARTIAL' && r.rec.level === 1 && /확인할/.test(sup(r)[0].text), 'T14 RV04 다음에 잘할게요 → 확인 항목 구체화', [r.j, sup(r)[0]]);
// T15
r = submit(null, 'RD01', { angB: '', angC: '', angD: '', work: '답만 알려줘' });
ok(r.j.state === 'INVALID_RESPONSE' && r.rec.level === 1 && sup(r)[0].entryId === 'C-ANSWER_REQUEST', 'T15 답만 알려줘 → 수준1 조건 확인, 답변 차단', [r.j, sup(r)[0]]);
// T16
r = help(null, 'RD01');
ok(sup(r)[0].level === 0 && sup(r)[0].entryId === 'C-PRE_SUBMIT', 'T16 제출 전 도움 요청 → 수준0, 먼저 생각 작성', sup(r)[0]);
// T17: 수준3에서 재수행해 해결 → ASSISTED, 추가 상향 금지
let rec = E.newRec();
r = submit(rec, 'RD01', { angB: '68', angC: '112', angD: '68', work: '' }); rec = r.rec;           // L1 자동
r = submit(rec, 'RD01', { angB: '68', angC: '112', angD: '68', work: '같은 각' }); rec = r.rec;   // 같은 수준 재표현
r = help(rec, 'RD01'); rec = r.rec; ok(rec.level === 2, 'T17 준비: 재수행 후 도움 → 수준2', rec);
r = submit(rec, 'RD01', { angB: '68', angC: '112', angD: '68', work: '?' }); rec = r.rec;
r = help(rec, 'RD01'); rec = r.rec; ok(rec.level === 3, 'T17 준비: 재수행 후 도움 → 수준3', rec);
r = submit(rec, 'RD01', { angB: '112', angC: '68', angD: '112', work: '이웃한 두 각의 합이 180이고 마주 보는 각은 같다' }); rec = r.rec;
ok(rec.status === 'clear' && rec.performance === 'ASSISTED_SUCCESS' && rec.level === 0 && rec.maxLevel === 3, 'T17 수준3에서 해결 → ASSISTED_SUCCESS, 중단', rec);
r = help(rec, 'RD01'); ok(r.rec.level === 0 && sup(r)[0].entryId === 'C-ALREADY_DONE', 'T17 해결 후 추가 상향 없음', sup(r)[0]);
// T18: 짝 문항 지원 감소 관찰
const recs = { RD01: Object.assign(E.newRec(), { supportCount: 2, status: 'clear' }) };
r = submit(null, 'RF03', { use: 'reject', property: '이웃한 두 각의 합은 180', judgment: '3x+10+2x+20=180이라 x=30', final: 'x=30' }, 'EXPERIMENT', recs);
ok(r.rec.fading === 'DECREASED' && r.rec.performance === 'INDEPENDENT_SUCCESS', 'T18 유사 문항 독립 성공 → fading DECREASED', r.rec);
// T19: 판정 불확실 → 보류
let j = E.combine('RC02', 'EXPERIMENT', judge('RC02', { text: '각끼리 관계가 있다' }), [{ state: 'PARTIAL', missing: [] }, { state: 'CLEAR_INDEPENDENT', missing: [] }], true);
ok(j.state === 'AMBIGUOUS' && j.needsReview && j.source === 'hold', 'T19 AI 2회 불일치 → 보류, 사람 검토', j);
r = E.onSubmit(null, j, { stage: 'Recite', itemId: 'RC02', group: 'EXPERIMENT', settings: S });
ok(r.rec.level === 1 && !/180|같/.test(sup(r)[0].text.replace(/같은|같다는|같다/g, '')), 'T19 정답 단정 없이 의미 확인 질문', sup(r)[0]);
// T20: 모델 문장에 정답 포함 → 차단
let chk = E.checkOutput('∠B는 112°예요. 다시 확인해 볼까요?', C.BANK.find(b => b.item === 'RD01' && b.level === 2).text, '68', 'RD01');
ok(!chk.ok, 'T20 정답 숫자 포함 문장 차단', chk);
chk = E.checkOutput('정답이에요! 다음으로 가요.', '그 값을 정할 때 사용한 평행사변형의 성질은 무엇인가요?', '', 'RD01');
ok(!chk.ok && chk.reason === 'correctness_signal', 'T20 정오 신호 차단', chk);
chk = E.checkOutput('‘모두 68’이라고 쓴 근거는 무엇인가요? 그림에서 ∠A와 ∠B가 어디에 있는지 함께 적어 보세요.', C.BANK.find(b => b.id.startsWith('RD01-L1-MISAPPLIED')).text, '모두 68도', 'RD01');
ok(chk.ok, 'T20 학생 표현 인용은 허용', chk);
// T21: 통제집단은 AI 개입 0회
r = submit(null, 'RD01', { angB: '68', angC: '68', angD: '68', work: '' }, 'CONTROL');
ok(r.out.length === 0, 'T21 통제집단 제출 시 AI 지원 없음', r.out);
r = help(r.rec, 'RD01', 'CONTROL');
ok(r.out.some(o => o.kind === 'request') && sup(r).length === 0, 'T21 통제집단 도움 요청 → 교사 요청만', r.out);
let opt = E.teacherOptions(E.newRec(), 'Read');
ok(opt.preSubmitOnly && opt.levels.join() === '0', 'T21 교사도 제출 전에는 수준0만', opt);
opt = E.teacherOptions(Object.assign(E.newRec(), { attempts: 1, level: 1 }), 'Recite');
ok(opt.levels.join() === '1,2,3' && opt.suggested === 2, 'T21 교사 선택지 단계 상한 적용', opt);
// T22: 수준4 이후 계속 오류 → 미해결
rec = Object.assign(E.newRec(), { attempts: 4, level: 4, maxLevel: 4, supportCount: 4, lastSupportAttempt: 4 });
r = submit(rec, 'RF03', { use: 'reject', property: '', judgment: '모르겠어요', final: '' });
ok(r.rec.status === 'unresolved' && r.rec.performance === 'UNRESOLVED' && !/30/.test(sup(r)[0].text), 'T22 수준4 이후 오류 → UNRESOLVED, 최종 답 없음', [r.rec, sup(r)[0]]);
// T23: 시간 종료 직전 미제출
r = E.onStageClose(E.newRec(), { group: 'EXPERIMENT', hasDraft: true });
ok(r.rec.status === 'incomplete' && r.events[0].type === 'TIMEOUT' && r.events[0].incomplete, 'T23 미제출 → 임시저장분 미완료 기록', r);

// 00 문서: 표현이 달라도 같은 뜻 인정, 다른 뜻은 구분
const P = (t, sel) => E.detect(t, sel);
ok(P('AO=OC').BISECT_ONE, '동치: AO=OC → AC 이등분');
ok(P('AO와 OC의 길이는 같다').BISECT_ONE || P('AO와 OC의 길이는 같다').P_DIAG_BISECT === false, '동치: AO와 OC의 길이는 같다(등식 없음, 도형 선택으로 보완)');
ok(P('두 선분의 길이가 같아요', ['half:AO', 'half:OC']).BISECT_ONE, '동치: AO·OC 선택 + “두 선분의 길이가 같아요”');
ok(P('대각선 AC는 O에서 반으로 나뉜다').BISECT_ONE, '동치: 대각선 AC는 O에서 반으로 나뉜다');
ok(P('AC=BD').M_DIAG_EQUAL && !P('AC=BD').P_DIAG_BISECT, '구분: AC=BD는 오개념');
ok(P('두 대각선은 서로를 이등분한다').P_DIAG_BISECT, '서로를 이등분');
ok(P('마주 보는 두 변의 길이는 각각 같다').P_OPP_SIDES, '대변 길이');
ok(P('마주 보는 각은 같고 이웃한 각의 합은 180도').P_OPP_ANGLES && P('마주 보는 각은 같고 이웃한 각의 합은 180도').P_ADJ_180, '각의 두 성질');
ok(!P('대각선의 길이는 같지 않다').M_DIAG_EQUAL, '부정문은 오개념 아님');
ok(E.numVal('180-68') === 112 && E.numVal('112°') === 112 && E.numVal('∠B=112도') === 112 && E.numVal('9/2') === 4.5, '수식 값 계산');


// 자연스러운 표현 추가 점검
const J = (it, f, g) => judge(it, f, g).state;
ok(J('RD01', { angB: '112', angC: '68', angD: '112', work: 'B는 180에서 68을 빼서 112, C는 A랑 마주보니까 같아서 68, D는 B랑 마주봐서 112' }) === 'CLEAR_INDEPENDENT', '표현: RD01 구어체 근거');
ok(J('RD02', { OC: '3', OD: '4.5', work: 'O는 대각선의 중점이라 OC=AO=3, OD=BO=4.5' }) === 'CLEAR_INDEPENDENT', '표현: RD02 중점·등식');
ok(J('RD02', { OC: '3', OD: '4.5', work: '두 대각선이 서로를 이등분하니까' }) === 'CLEAR_INDEPENDENT', '표현: RD02 서로 이등분');
ok(J('RC01', { text: '마주보는 변끼리 길이가 같다' }) === 'CLEAR_INDEPENDENT', '표현: RC01 변끼리');
ok(J('RC01', { text: '네 변의 길이가 모두 같다' }) === 'MISAPPLIED_PROPERTY', '표현: RC01 네 변 같음 오개념');
ok(J('RC02', { text: '마주 보는 각의 크기가 같다' }) === 'PARTIAL', '표현: RC02 한 성질만');
ok(J('RC03', { text: '대각선은 반으로 나뉜다' }) === 'AMBIGUOUS', '표현: RC03 모호한 반으로 나뉨');
ok(J('QU01', { text: '평행사변형의 대각선은 왜 서로 이등분할까?' }) === 'CLEAR_INDEPENDENT', '표현: QU01 질문');
ok(J('QU01', { text: '112도' }) === 'INVALID_RESPONSE', '표현: QU01 질문 대신 답');
ok(J('PV01', { text: '사각형이고 마주보는 변이 평행하다' }) === 'CLEAR_INDEPENDENT', '표현: PV01 선행지식');
ok(J('RF01', { use: 'accept', property: '마주 보는 변의 길이가 같다', judgment: 'AB와 CD가 마주 보고 BC와 AD가 마주 봐서', final: 'CD=8, AD=5' }) === 'CLEAR_INDEPENDENT', '표현: RF01 근거 있는 수용');
ok(J('RF01', { first: 'CD=8cm, AD=5cm', property: '마주 보는 변의 길이가 같다', recheck: '', final: 'CD=8, AD=5 마주 보는 변이라서' }, 'CONTROL') === 'CLEAR_INDEPENDENT', '표현: 통제 RF01');
ok(J('RF02', { use: 'reject', property: '대각선은 서로 이등분', judgment: 'AO와 OC는 7이지만 BD 길이를 모르니 BO와 OD는 알 수 없다', final: 'AO=OC=7' }) === 'CLEAR_INDEPENDENT', '표현: RF02 BD 정보 부족');
ok(J('RF02', { use: 'accept', property: '두 대각선의 길이가 같다', judgment: '그래서 BO도 7', final: '' }) === 'MISAPPLIED_PROPERTY', '표현: RF02 대각선 길이 같음 오개념');
ok(J('RF03', { use: 'reject', property: '이웃한 각의 합은 180', judgment: '5x+30=180', final: 'x=30' }) === 'CLEAR_INDEPENDENT', '표현: RF03 정석');


// 교재 표현(개념 자료) 인정
ok(J('RC03', { text: '두 대각선은 서로 다른 것을 이등분한다' }) === 'CLEAR_INDEPENDENT', '교재 표현: 서로 다른 것을 이등분');
ok(J('RC03', { text: '서로 다른 것을 이등분한다' }) === 'CLEAR_INDEPENDENT', '교재 표현: 대각선 칸에서 주어 생략');
ok(J('RC01', { text: '두 쌍의 대변의 길이는 각각 같다' }) === 'CLEAR_INDEPENDENT', '교재 표현: 대변의 길이');
ok(J('RC02', { text: '두 쌍의 대각의 크기는 각각 같다' }) === 'PARTIAL', '교재 표현: 대각만(이웃각 180 빠짐) → 일부');
ok(J('RC02', { text: '두 쌍의 대각의 크기는 각각 같고 이웃한 두 각의 합은 180도' }) === 'CLEAR_INDEPENDENT', '교재 표현: 대각 + 이웃각');
ok(J('RD03', { text: '두 쌍의 대각의 크기는 각각 같고 ∠A+∠B=180°, 두 대각선은 서로 다른 것을 이등분한다' }) === 'CLEAR_INDEPENDENT', '교재 표현: RD03 세 성질');
ok(C.MATERIALS.length === 9 && C.MATERIALS.filter(m => m.lesson === 1).length === 2, '개념 자료 9장, 1차시 2장');

// 발문 은행 무결성
const ids = new Set(); let dup = [];
C.BANK.forEach(b => { if (ids.has(b.id)) dup.push(b.id); ids.add(b.id); });
ok(!dup.length, '발문 ID 중복 없음', dup);
const cap = {}; C.STAGES.forEach(s => cap[s.id] = s.cap);
ok(C.BANK.every(b => b.level <= cap[E.ITEM[b.item].stage]), '단계 상한 초과 발문 없음');
ok(C.BANK.every(b => !/(정답이에요|맞아요|틀렸|잘했|훌륭|정확해요)/.test(b.text)), '정오 신호 발문 없음');
ok(C.BANK.filter(b => /^RC/.test(b.item)).every(b => !E.leakCheck(b.item, b.text)), 'Recite 발문에 성질 정답 노출 없음');
ok(C.BANK.every(b => !E.leakCheck(b.item, b.text) || /-L4-/.test(b.id)), '수치 정답 노출 없음');
const missingCells = [];
['EXPERIMENT', 'CONTROL'].forEach(g => C.ITEMS.forEach(it => {
  for (let l = 1; l <= cap[it.stage]; l++) {
    const pool = C.BANK.filter(b => b.item === it.id && b.level === l && (!b.group || b.group === g) && b.state === '*');
    if (pool.length < 2) missingCells.push(g + ' ' + it.id + ' L' + l + ' (' + pool.length + ')');
  }
}));
ok(!missingCells.length, '모든 문항·수준·집단에 일반 발문 2개(재표현용) 이상', missingCells);

// 검증 회차(2026-10-17)에서 찾은 결함 재발 방지
{
  // 답 요청을 반복해도 같은 문장이 되풀이되지 않고, 기록된 수준과 발문 수준이 같아야 한다
  const ctx = { stage: 'Read', itemId: 'RD01', group: 'EXPERIMENT', settings: S, recs: {} };
  const ask = () => E.combine('RD01', 'EXPERIMENT', judge('RD01', { work: '답 알려줘' }), null, false);
  let rec = E.newRec(); const seen = []; let r;
  r = E.onSubmit(rec, ask(), ctx); rec = r.rec; seen.push(...sup(r));
  r = E.onHelp(rec, ctx); rec = r.rec; seen.push(...sup(r));
  r = E.onSubmit(rec, ask(), ctx); rec = r.rec; seen.push(...sup(r));
  r = E.onHelp(rec, ctx); rec = r.rec; seen.push(...sup(r));
  r = E.onSubmit(rec, ask(), ctx); rec = r.rec; seen.push(...sup(r));
  r = E.onHelp(rec, ctx); rec = r.rec; seen.push(...sup(r));
  const sameAsPrev = seen.filter((o, i) => i > 0 && o.entryId === seen[i - 1].entryId);
  ok(seen[0].entryId === 'C-ANSWER_REQUEST' && !sameAsPrev.length, '답 요청 반복: 공통 응답은 첫 지원에만, 같은 문장 반복 없음', seen.map(o => o.entryId));
  const mismatch = seen.filter(o => o.level >= 2 && !new RegExp('-L' + o.level + '-').test(o.entryId));
  ok(!mismatch.length && rec.level === 3, '답 요청 반복: 기록된 수준 = 실제 발문 수준', seen.map(o => o.level + ':' + o.entryId));
  // 뜻 확인 공통 응답 뒤 도움 요청 → 문항 발문으로 재표현
  const c2 = { stage: 'Read', itemId: 'RD03', group: 'EXPERIMENT', settings: S, recs: {} };
  let r2 = E.onSubmit(E.newRec(), E.combine('RD03', 'EXPERIMENT', judge('RD03', { text: '그냥 그렇게 했어요 계산함' }), null, false), c2);
  const h2 = E.onHelp(r2.rec, c2);
  ok(sup(r2)[0].entryId === 'C-AMBIGUOUS' && sup(h2)[0].entryId !== 'C-AMBIGUOUS' && /^RD03-L1-/.test(sup(h2)[0].entryId), '뜻 확인 뒤 재표현은 다른 문장', [sup(r2)[0].entryId, sup(h2)[0].entryId]);
  // 03 원문 72개가 모두 은행 반영 또는 제외 목록(사유)에 있음
  const fs = require('fs'); const up = process.argv[3];
  if (up && fs.existsSync(up)) {
    const f03 = fs.readdirSync(up).find(n => /(^|[^0-9])03[^0-9].*\.json$/.test(n));
    const key = JSON.parse(fs.readFileSync(require('path').join(up, f03), 'utf8'));
    const orphan = [];
    key.items.forEach(k => k.sample_scaffolds_levels_1_to_4.forEach((t, i) => {
      const lv = i + 1;
      const used = C.BANK.some(b => b.item === k.item_id && b.level === lv && b.src === '03');
      const exc = C.EXCLUDED.some(x => x.item === k.item_id && x.level === lv && x.reason);
      if (!used && !exc) orphan.push(k.item_id + ' L' + lv);
    }));
    ok(!orphan.length, '03 발문 72개 모두 추적 가능(반영 또는 제외 사유)', orphan);
    const rub = key.items.filter(k => { const rb = C.RUBRIC[k.item_id]; return rb.expected !== k.hidden_expected || rb.accepted !== k.accepted || rb.misconceptions !== k.misconceptions; }).map(k => k.item_id);
    ok(!rub.length, '비공개 기준이 03 원문과 같음(answer_key_version 일치)', rub);
  }
  const pr = E.buildJudgePrompt('RD01', 'EXPERIMENT', { angB: '112' }, {}, S);
  ok(/\[추가 기준\].*07 QA/.test(pr) && pr.indexOf('B=112°, C=68°, D=112°') >= 0, 'AI 판정 프롬프트: 03 원문 기준 + 추가 기준 출처 표시');
}

console.log('발문 수: ' + C.BANK.length + ' (+공통 ' + Object.keys(C.COMMON).length + ', 제외 ' + C.EXCLUDED.length + ')');
console.log(pass + ' 통과, ' + fail + ' 실패');
failures.forEach(f => console.log('  ✗ ' + f));
process.exit(fail ? 1 : 0);
