// 추가 검증: 상태기계 무작위 시뮬레이션(54,000회), 판정 퍼징, 발문 은행 충족, 원자료(03·04·06) 대조
// 실행: node sim_fuzz.js <앱 폴더> <클라이언트 원본 파일 폴더>
const path = require('path');
const fs = require('fs');
const APP = process.argv[2];
const UP = process.argv[3];
function findSrc(dir, num, ext) { const fs = require('fs'); const f = fs.readdirSync(dir).find(n => new RegExp('(^|[^0-9])' + num + '[^0-9].*\\.' + ext + '$').test(n)); if (!f) throw new Error(num + ' 파일 없음: ' + dir); return require('path').join(dir, f); }
const C = require(path.resolve(APP, 'content.js'));
const E = require(path.resolve(APP, 'engine.js'));
let pass = 0, fail = 0; const fails = [];
function ok(c, name, extra) { if (c) pass++; else { fail++; fails.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 400) : '')); } }

const STATES = Object.keys(C.STATES);
const GROUPS = ['EXPERIMENT', 'CONTROL'];
const CORR = /(정답이에요|맞아요|맞습니다|틀렸|틀립|옳아|잘했|훌륭|완벽|정확해|정확합)/;

// 시드 고정 난수
let seed = 20261017; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }

/* A. 발문 은행 충족: 모든 문항×집단×수준(1~상한)×상태×변형에서 발문이 나오는가 */
let gaps = [];
C.ITEMS.forEach(it => {
  const cap = E.STAGE[it.stage].cap;
  GROUPS.forEach(g => {
    for (let lv = 1; lv <= cap; lv++) {
      STATES.filter(s => s !== 'CLEAR_INDEPENDENT').forEach(st => {
        ['a', 'b'].forEach(v => {
          const e = E.pickEntry(it.id, lv, st, null, [], g, v, null) || E.pickEntry(it.id, lv, '*', null, null, g, 'a', null);
          if (!e) gaps.push([it.id, g, lv, st, v].join('/'));
        });
      });
      // 교사 선택지(통제)
      if (g === 'CONTROL' && !E.bankFor(it.id, lv, g).length) gaps.push('teacherBank ' + it.id + '/L' + lv);
    }
  });
});
ok(gaps.length === 0, 'A1 모든 문항·수준·상태 조합에 발문 존재', gaps.slice(0, 20));

// 재표현용 b 변형: 각 문항·수준에 서로 다른 발문이 2개 이상 있어야 같은 수준 재표현이 같은 문장 반복이 아님
let single = [];
C.ITEMS.forEach(it => {
  const cap = E.STAGE[it.stage].cap;
  GROUPS.forEach(g => { for (let lv = 1; lv <= cap; lv++) { const n = E.bankFor(it.id, lv, g).length; if (n < 2) single.push(it.id + '/' + g + '/L' + lv + '=' + n); } });
});
ok(single.length === 0, 'A2 문항·수준마다 재표현 가능한 발문 2개 이상', single);

// 은행 항목 속성
const ids = new Set(); let dup = [], overCap = [], badLevel = [], noType = [], corr = [], leakLow = [];
C.BANK.forEach(e => {
  if (ids.has(e.id)) dup.push(e.id); ids.add(e.id);
  const it = E.ITEM[e.item]; if (!it) { badLevel.push('no item ' + e.id); return; }
  if (e.level > E.STAGE[it.stage].cap) overCap.push(e.id);
  if (!(e.level >= 1 && e.level <= 4)) badLevel.push(e.id);
  if (!e.type || !e.mechanism) noType.push(e.id);
  if (CORR.test(e.text)) corr.push(e.id);
  if (E.leakCheck(e.item, e.text) && !(e.level === 4 && /^(RD0[12]|RF0[123])$/.test(e.item))) leakLow.push(e.id + ': ' + e.text);
});
ok(!dup.length, 'A3 발문 ID 중복 없음', dup);
ok(!overCap.length, 'A4 단계 상한 초과 발문 없음', overCap);
ok(!badLevel.length, 'A5 수준 범위 1~4', badLevel);
ok(!noType.length, 'A6 모든 발문에 지원 유형·기제 태그', noType);
ok(!corr.length, 'A7 발문에 정오 신호 없음', corr);
ok(!leakLow.length, 'A8 정답 노출 발문 없음(수준4 핵심 성질 제외)', leakLow);
// 공통 응답 정오 신호
const comCorr = Object.values(C.COMMON).filter(c => CORR.test(c.text)).map(c => c.id + ':' + c.text);
ok(!comCorr.length, 'A9 공통 응답 정오 신호 없음', comCorr);
// Reflect 발문이 고정 AI 응답의 정오를 밝히지 않음
const rfReveal = C.BANK.filter(e => /^RF/.test(e.item) && /(AI(가|의)?\s*(답|응답|말)?(이|은|는)?\s*(틀|맞|옳|잘못))/.test(e.text)).map(e => e.id + ':' + e.text);
ok(!rfReveal.length, 'A10 Reflect 발문이 AI 응답 정오를 밝히지 않음', rfReveal);

/* B. 상태기계 무작위 시뮬레이션 */
const MISC = [null, 'answer_request', 'copy', 'off_topic', 'calc', 'adj_equal', 'diag_equal', 'missing_values'];
const MISSING = [[], ['P_ADJ_180'], ['P_OPP_ANGLES'], ['P_DIAG_BISECT']];
let viol = {}; function V(k, x) { (viol[k] = viol[k] || []).length < 5 && viol[k].push(x); viol[k].n = (viol[k].n || 0) + 1; }
let runs = 0, totalOuts = 0; const b11 = {};
C.ITEMS.forEach(it => {
  const st = E.STAGE[it.stage];
  GROUPS.forEach(g => {
    for (let r = 0; r < 1500; r++) {
      runs++;
      let rec = E.newRec(); const trace = []; const levelUses = {};
      const steps = 1 + Math.floor(rnd() * 12);
      for (let s = 0; s < steps; s++) {
        const a = rnd();
        let res, act;
        try {
          if (a < 0.5) {
            const state = pick(STATES);
            const misc = state === 'INVALID_RESPONSE' ? pick(['answer_request', 'copy', 'off_topic', null]) : pick(MISC.filter(m => !['answer_request', 'copy', 'off_topic'].includes(m)));
            const j = { state, misc, missing: pick(MISSING), needsReview: rnd() < 0.2 };
            act = 'submit:' + state; res = E.onSubmit(rec, j, { stage: it.stage, itemId: it.id, group: g, settings: { fadingPairs: true }, recs: {} });
          } else if (a < 0.95) { act = 'help'; res = E.onHelp(rec, { stage: it.stage, itemId: it.id, group: g }); }
          else { act = 'close'; res = Object.assign({ out: [] }, E.onStageClose(rec, { group: g, hasDraft: rnd() < 0.5 })); }
        } catch (err) { V('B0 예외', [it.id, g, trace.concat(act), String(err)]); break; }
        trace.push(act);
        const prev = rec; rec = res.rec; totalOuts += res.out.length;
        if (rec.status === 'clear' && prev.status !== 'clear') Object.keys(levelUses).forEach(k => delete levelUses[k]);
        if (rec.level > st.cap) V('B1 상한 초과', [it.id, g, trace, rec.level]);
        (res.events || []).forEach(ev => {
          if (ev.type === 'LEVEL_CHANGE' && ev.after > ev.before + 1) V('B2 두 단계 이상 상승', [it.id, g, trace, ev]);
          if (ev.type === 'LEVEL_CHANGE' && ev.after >= 2 && act !== 'help') V('B3 수준2 이상이 도움 버튼 없이 열림', [it.id, g, trace, ev]);
          if (ev.type === 'LEVEL_CHANGE' && ev.after > ev.before && act === 'help' && ev.before > 0 && !(prev.attempts > prev.levelSetAttempt)) V('B4 재제출 없이 상승', [it.id, g, trace, ev]);
        });
        res.out.forEach(o => {
          if (o.kind === 'support' && (o.level || 0) > 0 && rec.attempts === 0) V('B5 첫 제출 전 수준1 이상', [it.id, g, trace, o]);
          if (g === 'CONTROL' && o.kind === 'support') V('B6 통제집단에 자동 지원', [it.id, g, trace, o]);
          if (!st.auto && act.startsWith('submit') && o.kind === 'support') V('B7 자동 점검 없는 단계에서 제출 시 지원', [it.id, g, trace, o]);
          if (o.kind === 'support' && !o.text) V('B8 빈 발문', [it.id, g, trace, o]);
          if (o.kind === 'support' && CORR.test(o.text)) V('B9 정오 신호', [it.id, g, trace, o.text]);
          if (o.kind === 'support' && o.level > 0 && !o.ack && !o.procedural && o.entryId && !/^C-/.test(o.entryId)) {
            const k = o.level; levelUses[k] = (levelUses[k] || 0) + 1;
            if (levelUses[k] > 2) V('B10 같은 수준 발문 3회 이상(재표현 1회 초과)', [it.id, g, trace, k]);
          }
          if (o.kind === 'support' && o.reason && /REPHRASE/.test(o.reason) && o.entryId === prev.lastEntryId) { V('B11 재표현이 직전과 같은 문장', [it.id, g, trace, o.entryId]); b11[o.entryId] = (b11[o.entryId] || 0) + 1; }
          if (o.kind === 'support' && E.leakCheck(it.id, o.text) && !(o.level === 4 && /^(RD0[12]|RF0[123])$/.test(it.id))) V('B12 정답 노출', [it.id, g, trace, o.text]);
        });
        if (prev.status === 'unresolved' && rec.level > prev.level) V('B13 미해결 후 수준 상승', [it.id, g, trace]);
        if (rec.status === 'clear' && rec.level !== 0) V('B14 해결 후 수준 미복귀', [it.id, g, trace]);
        if (rec.performance === 'UNRESOLVED' && prev.level < st.cap && act !== 'close' && rec.status === 'unresolved') V('B15 상한 전 미해결', [it.id, g, trace, prev.level]);
        if (act === 'close') { s = steps; }
        if (g === 'CONTROL' && (rec.performance === 'INDEPENDENT_SUCCESS' || rec.performance === 'ASSISTED_SUCCESS')) V('B16 통제집단 성공 판정 기록', [it.id, g, trace, rec.performance]);
        if (rec.performance === 'INDEPENDENT_SUCCESS' && rec.supportCount > 0) V('B17 도움 받은 뒤 독립 성공', [it.id, g, trace]);
      }
    }
  });
});
const vk = Object.keys(viol);
['B0 예외', 'B1 상한 초과', 'B2 두 단계 이상 상승', 'B3 수준2 이상이 도움 버튼 없이 열림', 'B4 재제출 없이 상승', 'B5 첫 제출 전 수준1 이상', 'B6 통제집단에 자동 지원', 'B7 자동 점검 없는 단계에서 제출 시 지원', 'B8 빈 발문', 'B9 정오 신호', 'B10 같은 수준 발문 3회 이상(재표현 1회 초과)', 'B11 재표현이 직전과 같은 문장', 'B12 정답 노출', 'B13 미해결 후 수준 상승', 'B14 해결 후 수준 미복귀', 'B15 상한 전 미해결', 'B16 통제집단 성공 판정 기록', 'B17 도움 받은 뒤 독립 성공'].forEach(k => ok(!viol[k], k + ' (무작위 ' + 'runs)', viol[k] ? { n: viol[k].n, ex: viol[k].slice(0, 2) } : undefined));
console.log('B11 내역', JSON.stringify(b11)); console.log('시뮬레이션', runs, '회, 출력', totalOuts, '건');

/* C. 판정 퍼징 */
const POOL = ['AO', 'OC', 'BO', 'OD', '=', '∠A', '∠B', '68', '112', '180', '3', '4.5', '7', '8', '5', 'x', '30', '10', ' ', '같다', '이등분', '마주 보는', '이웃한', '모르겠다', '답 알려줘', '?', '왜', '각', '변', '대각선', '(', ')', '+', '-', '*', '/', '°', 'cm', '\n', '😀', '<script>', '"', "'", '{AB}', 'constructor', '__proto__', 'ㅋㅋ', '아닌', '틀', 'AI가 맞아요', '정할 수 없다'];
function rstr(n) { let s = ''; for (let i = 0; i < n; i++) s += pick(POOL); return s; }
let fuzzErr = [], fuzzBad = [], slow = [];
C.ITEMS.forEach(it => {
  GROUPS.forEach(g => {
    const ri = E.resolveItem(it.id, g, { controlRF03: 'neutral' });
    for (let r = 0; r < 400; r++) {
      const f = {};
      ri.fields.forEach(fd => { f[fd.key] = fd.kind === 'choice' ? pick([null, 'accept', 'partial', 'reject', 'weird']) : (rnd() < 0.1 ? '' : rstr(1 + Math.floor(rnd() * 25))); });
      const t0 = process.hrtime.bigint();
      try {
        const j = E.judgeRule(it.id, g, f, { a: ['seg:AO'] }, { controlRF03: 'neutral', fadingPairs: true });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6; if (ms > 50) slow.push([it.id, ms]);
        if (!STATES.includes(j.state)) fuzzBad.push([it.id, j.state]);
        const c = E.combine(it.id, g, j, null, false); if (!STATES.includes(c.state)) fuzzBad.push([it.id, 'combine', c.state]);
      } catch (e) { fuzzErr.push([it.id, g, String(e), JSON.stringify(f).slice(0, 120)]); }
    }
    // 아주 긴 입력
    const f2 = {}; ri.fields.forEach(fd => { f2[fd.key] = fd.kind === 'choice' ? 'accept' : 'AO=OC 이고 BO=OD 이다 '.repeat(250); });
    const t1 = Date.now();
    try { E.judgeRule(it.id, g, f2, {}, {}); } catch (e) { fuzzErr.push([it.id, 'long', String(e)]); }
    if (Date.now() - t1 > 1500) slow.push([it.id, 'long', Date.now() - t1]);
  });
});
ok(!fuzzErr.length, 'C1 무작위 입력에서 판정 예외 없음 (' + 18 * 2 * 400 + '건)', fuzzErr.slice(0, 3));
ok(!fuzzBad.length, 'C2 판정 결과가 항상 9개 상태 중 하나', fuzzBad.slice(0, 3));
ok(!slow.length, 'C3 판정 시간(일반 50ms, 5천 자 1.5초 이내)', slow.slice(0, 5));
// numVal 안전성
const nv = ['constructor', '__proto__', 'alert(1)', '(('.repeat(5000) + '1', '1e309', '9'.repeat(400), '1/0', '0/0', '--5', '3x+10', '∠B=180-68', '180−68', '112°', '4.5cm', '4,5'];
let nvErr = [];
nv.forEach(x => { try { const v = E.numVal(x); if (v !== null && !isFinite(v)) nvErr.push([x.slice(0, 20), v]); } catch (e) { nvErr.push([x.slice(0, 20), String(e)]); } });
ok(!nvErr.length, 'C4 수식 값 계산이 이상 입력에서 안전', nvErr);
ok(E.numVal('∠B=180-68') === 112 && E.numVal('180−68') === 112 && E.numVal('112°') === 112 && E.numVal('4.5cm') === 4.5, 'C5 동치 수식 값', [E.numVal('∠B=180-68'), E.numVal('180−68'), E.numVal('112°'), E.numVal('4.5cm')]);
// AI 응답 파싱 안전성
const pj = [null, 1, 'x', {}, { state: 'HACK' }, { state: 'PARTIAL', missing: 'P_ADJ_180' }, { state: 'PARTIAL', missing: ['EVIL', 'P_ADJ_180'], misconception: 'x'.repeat(500), evidence: 'y'.repeat(900) }];
const pr = pj.map(x => E.parseJudge(x));
ok(pr[0] === null && pr[1] === null && pr[2] === null && pr[3] === null && pr[4] === null && pr[5].missing.length === 0 && pr[6].missing.join() === 'P_ADJ_180' && pr[6].misc.length <= 40 && pr[6].evidence.length <= 200, 'C6 AI 판정 응답 파싱이 잘못된 값을 거름', pr);
// 결합: 불일치 → 보류
const rule = { state: 'PARTIAL', misc: null, missing: [], decisive: false, flag: 'text' };
const cmb = E.combine('RD03', 'EXPERIMENT', rule, [{ state: 'CLEAR_INDEPENDENT', missing: [] }, { state: 'PARTIAL', missing: [] }], true);
ok(cmb.state === 'AMBIGUOUS' && cmb.needsReview && cmb.agree === false, 'C7 AI 2회 불일치 → 보류·검토 필요', cmb);
const cmb2 = E.combine('RD03', 'CONTROL', rule, [{ state: 'CLEAR_INDEPENDENT', missing: [] }, { state: 'CLEAR_INDEPENDENT', missing: [] }], true);
ok(cmb2.source === 'rule', 'C8 통제집단은 AI 판정 결과를 쓰지 않음', cmb2);
const cmb3 = E.combine('RD03', 'EXPERIMENT', rule, [null, null], true);
ok(cmb3.source === 'rule(ai_unavailable)' && cmb3.needsReview, 'C9 AI 실패 시 규칙 판정 + 검토 필요', cmb3);

/* D. 출력 검사(문장 다듬기·교사 자유 문구) */
const tpl = 'A와 B는 어떤 위치 관계인가요?';
const cases = [
  ['A와 B의 위치 관계를 살펴볼까요?', true],
  ['정답이에요! A와 B를 보세요.', false],
  ['∠B는 112°예요.', false],
  ['이웃한 두 각의 합은 180°예요.', false],
  ['A와 B는 어떤 위치 관계인지 다시 볼까요?', true],
  ['', false],
  ['잘했어요. 다시 볼까요?', false],
];
const dres = cases.map(([t, exp]) => [t, E.checkOutput(t, tpl, '각 A는 68', 'RD01'), exp]);
ok(dres.every(([t, r, exp]) => r.ok === exp), 'D1 다듬은 문장 검사(새 숫자·새 성질·정오 신호·빈 문장 차단)', dres.filter(([t, r, exp]) => r.ok !== exp));
ok(!E.checkOutput('x = 30이에요', '어떤 각의 관계를 썼나요?', '', 'RF03').ok, 'D2 RF03 정답 x=30 차단');
ok(!E.checkOutput('OD는 4.5예요', 'O에서 어떻게 나뉘나요?', 'BO=4.5', 'RD02').ok, 'D3 RD02 정답 OD=4.5 차단(학생이 쓴 숫자여도)', E.checkOutput('OD는 4.5예요', 'O에서 어떻게 나뉘나요?', 'BO=4.5', 'RD02'));

/* E. 원자료 대조 */
const key = JSON.parse(fs.readFileSync(findSrc(UP, '03', 'json'), 'utf8'));
ok(key.items.length === C.ITEMS.length && key.items.every((k, i) => k.item_id === C.ITEMS[i].id && k.stage === C.ITEMS[i].stage), 'E1 03 문항 18개·순서·단계 일치', key.items.map(k => k.item_id + ':' + k.stage).join(' '));
const rubMis = key.items.filter(k => { const r = C.RUBRIC[k.item_id]; return !r || r.expected !== k.hidden_expected || r.accepted !== k.accepted || r.misconceptions !== k.misconceptions; }).map(k => k.item_id);
ok(!rubMis.length, 'E2 비공개 기준(기대·인정·오개념)이 03 원문과 같음', rubMis.map(id => ({ id, app: C.RUBRIC[id], src: (k => ({ e: k.hidden_expected, a: k.accepted, m: k.misconceptions }))(key.items.find(x => x.item_id === id)) })));
// 03 발문: 은행에 들어갔거나 제외 목록에 있어야 함
const src03 = []; key.items.forEach(k => k.sample_scaffolds_levels_1_to_4.forEach((t, i) => src03.push({ item: k.item_id, level: i + 1, text: t })));
function nrm(s) { return String(s).replace(/[\s.?!,·'‘’"“”]/g, ''); }
const inBank = src03.filter(s => C.BANK.some(e => e.item === s.item && e.src === '03' && e.level === s.level));
const exc = C.EXCLUDED || [];
const missing03 = src03.filter(s => !C.BANK.some(e => e.item === s.item && e.src === '03' && e.level === s.level) && !exc.some(x => x.item === s.item && x.level === s.level));
ok(src03.length === 72 && !missing03.length, 'E3 03 발문 72개 = 은행 반영 + 제외 목록', { total: src03.length, inBank: inBank.length, excluded: exc.length, missing: missing03 });
// 정답값
const keyNums = { RD01: [112, 68, 112], RD02: [3, 4.5], RF01: [8, 5], RF03: [30] };
const j1 = E.judgeRule('RD01', 'EXPERIMENT', { angB: '180-68=112', angC: '∠A와 마주 보므로 68', angD: '∠B와 마주 보므로 112', work: '이웃한 두 각의 합은 180°, 마주 보는 각은 같다' }, {}, {});
const j2 = E.judgeRule('RD02', 'EXPERIMENT', { OC: '3', OD: '4.5', work: '두 대각선은 서로를 이등분한다' }, {}, {});
ok(j1.state === 'CLEAR_INDEPENDENT' && j2.state === 'CLEAR_INDEPENDENT', 'E4 03 정답(B=112·C=68·D=112, OC=3·OD=4.5)과 동치 근거 인정', [j1, j2]);
// 04 상태 9개
const s04 = JSON.parse(fs.readFileSync(findSrc(UP, '04', 'json'), 'utf8'));
ok(Object.keys(s04.student_state).join() === STATES.join(), 'E5 04 학생 상태 9개 이름·순서 일치', [Object.keys(s04.student_state), STATES]);
ok(Object.keys(s04.levels).join() === '0,1,2,3,4', 'E6 04 지원 수준 0~4');
// 06 로그 필드
const csv06 = fs.readFileSync(findSrc(UP, '06', 'csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map(l => l.split(',')[0]);
let store; global.window = { addEventListener() { } }; require(path.resolve(APP, 'store.js')); store = global.window.PQ_STORE;
ok(csv06.length === 30 && csv06.join() === store.LOG_FIELDS.join(), 'E7 06 로그 사전 30개 필드 이름·순서 일치', { src: csv06, app: store.LOG_FIELDS });
const et06 = 'FIRST_SUBMIT/RESUBMIT/SUPPORT_SENT/STATE_CHANGE/LEVEL_CHANGE/TIMEOUT/TEACHER_REVIEW'.split('/');
const engSrc0 = fs.readFileSync(path.resolve(APP, 'engine.js'), 'utf8');
const appSrc = fs.readFileSync(path.resolve(APP, 'app.js'), 'utf8');
const missEt = et06.filter(t => appSrc.indexOf("'" + t + "'") < 0 && engSrc0.indexOf("type: '" + t + "'") < 0);
ok(!missEt.length, 'E8 06 이벤트 유형 7개를 앱이 모두 기록', missEt);
const perf06 = ['INDEPENDENT_SUCCESS', 'ASSISTED_SUCCESS', 'UNRESOLVED', 'NOT_ASSESSED'];
const engSrc = fs.readFileSync(path.resolve(APP, 'engine.js'), 'utf8');
ok(perf06.every(p => engSrc.indexOf("'" + p + "'") >= 0), 'E9 06 수행 상태 4개 사용');
const fade06 = ['NONE', 'DECREASED', 'NOT_OBSERVED'];
ok(fade06.every(p => engSrc.indexOf("'" + p + "'") >= 0), 'E10 06 페이딩 값(NONE/DECREASED/NOT_OBSERVED) 사용');
// 단계 시간·합계
const mins = C.STAGES.map(s => s.min); ok(mins.join() === '2,2,16,17,8,5' && mins.reduce((a, b) => a + b) === 50, 'E11 단계 시간 2·2·16·17·8·5 = 50분', mins);
ok(C.STAGES.map(s => s.cap).join() === '2,2,4,4,3,2', 'E12 단계 상한 2·2·4·4·3·2', C.STAGES.map(s => s.cap));

/* F. 처치충실도 계산 */
const evs = [
  { event_type: 'SUPPORT_SENT', stage: 'Read', item_id: 'RD01', attempt_no: 0, support_level_after: 1, group: 'EXPERIMENT', support_provider: 'AI', student_id: 'E01', support_text: 'x' },
  { event_type: 'SUPPORT_SENT', stage: 'Review', item_id: 'RV01', attempt_no: 1, support_level_after: 3, group: 'EXPERIMENT', support_provider: 'AI', student_id: 'E01', support_text: 'x' },
  { event_type: 'SUPPORT_SENT', stage: 'Reflect', item_id: 'RF01', attempt_no: 1, support_level_after: 1, group: 'CONTROL', support_provider: 'AI', student_id: 'C01', support_text: '정답이에요' },
  { event_type: 'LEVEL_CHANGE', support_level_before: 1, support_level_after: 3 },
  { event_type: 'MATERIAL_OPEN', stage: 'Recite', group: 'CONTROL' },
  { event_type: 'SUPPORT_SENT', stage: 'Read', item_id: 'RD01', attempt_no: 1, support_level_after: 2, group: 'CONTROL', support_provider: 'TEACHER', student_id: 'C02', support_text: '∠B는 112', support_requested_at: '2026-10-17T00:00:00Z', support_sent_at: '2026-10-17T00:00:40Z' },
];
const fr = E.fidelity(evs);
ok(fr.preSubmitMath === 1 && fr.capViolations === 1 && fr.reflectSignals === 1 && fr.controlAI === 1 && fr.jumps === 1 && fr.materialInRecite === 1 && fr.leaks === 1 && fr.teacherWait.n === 1 && fr.teacherWait.median === 40, 'F1 충실도 위반을 각각 잡아냄', fr);
const fr0 = E.fidelity([]);
ok(fr0.preSubmitMath === 0 && fr0.teacherWait.n === 0, 'F2 빈 기록에서도 동작');

console.log(pass + ' 통과, ' + fail + ' 실패');
fails.forEach(f => console.log('FAIL ' + f));
