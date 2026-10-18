/* API 통합 시험: 실제 Postgres + 로컬 서버(dev/server.js). 사용: TEST_BASE=http://localhost:3200 DATABASE_URL=... node tests/api.test.js */
'use strict';
const postgres = require('postgres');
const BASE = process.env.TEST_BASE || 'http://localhost:3200';
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, onnotice: function () { } });
const RPW = process.env.RESEARCHER_PASSWORD, TPW = process.env.TEACHER_PASSWORD;

let pass = 0, fail = 0; const fails = [];
function ok(c, name, extra) { if (c) pass++; else { fail++; fails.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 500) : '')); } }
async function call(method, path, body, tok) {
  const h = { 'Content-Type': 'application/json' };
  if (tok) h.Authorization = 'Bearer ' + tok;
  const r = await fetch(BASE + '/api/v1/' + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch (e) { j = { _text: text }; }
  return { status: r.status, body: j, headers: r.headers };
}
const RUN = Date.now().toString(36).toUpperCase().slice(-4);
const S = 'T' + RUN, S2 = 'U' + RUN, SD = 'D' + RUN;

(async function main() {
  // ---------- 공개·보안 ----------
  let r = await call('GET', 'health'); ok(r.status === 200 && r.body.ok, '헬스 체크');
  r = await call('GET', 'content');
  const pub = JSON.stringify(r.body);
  ok(r.status === 200 && r.body.items.length === 18, '공개 내용 18문항');
  ok(!/"rubric"|"bank"\s*:\s*\[|-L[1-4]-|hidden_expected|misconceptions|EXCLUDED|"expected"/i.test(pub) && pub.indexOf('B=112°') < 0 && pub.indexOf('서로를 이등분해요') < 0 && pub.indexOf('이웃한 두 각의 합은 180°예요') < 0, '공개 내용에 정답 기준·발문 은행 없음');
  r = await call('GET', 'me'); ok(r.status === 401, '토큰 없이 학생 API 거부');
  r = await call('GET', 'admin/status', undefined, 'abc.def'); ok(r.status === 401, '위조 토큰 거부');
  r = await call('GET', 'nope'); ok(r.status === 404, '없는 주소 404');

  // ---------- 교직원 로그인 ----------
  r = await call('POST', 'login/staff', { role: 'teacher', password: 'wrong-password' }); ok(r.status === 401, '교사 비밀번호 틀림 거부');
  r = await call('POST', 'login/staff', { role: 'researcher', password: RPW }); ok(r.status === 200 && r.body.token, '연구자 로그인'); const RT = r.body.token;
  r = await call('POST', 'login/staff', { role: 'teacher', password: TPW, teacher_id: 't07' }); ok(r.status === 200 && r.body.tid === 'T07', '교사 로그인·교사 ID'); const TT = r.body.token;
  r = await call('GET', 'admin/status', undefined, TT); ok(r.status === 403, '교사는 연구자 API 못 씀');

  // ---------- 수업·명단 ----------
  r = await call('POST', 'admin/session', { code: S, lesson: 1, class_name: 'C' + RUN }, RT); ok(r.status === 200 && r.body.session.stage === 0 && r.body.session.settings.demoControls === false, '수업 만들기(시연 제어 기본 꺼짐)');
  r = await call('POST', 'admin/session', { code: S, lesson: 1 }, RT); ok(r.status === 409, '같은 수업 코드 거부');
  r = await call('POST', 'admin/session', { code: 'x y', lesson: 1 }, RT); ok(r.status === 400, '잘못된 수업 코드 거부');
  r = await call('POST', 'admin/session', { code: S2, lesson: 2 }, RT); ok(r.status === 400 && r.body.code === 'lesson_not_ready', '2차시는 아직 준비 안 됨');
  await call('POST', 'admin/session', { code: S2, lesson: 1, class_name: 'OTHER' + RUN }, RT);
  const roster = ['code,group,class,pin'];
  for (let i = 1; i <= 15; i++) roster.push('E' + RUN + String(i).padStart(2, '0') + ',실험,C' + RUN + ',');
  for (let i = 1; i <= 15; i++) roster.push('C' + RUN + String(i).padStart(2, '0') + ',통제,C' + RUN + ',');
  roster.push('L' + RUN + '01,E,C' + RUN + ',4321');
  r = await call('POST', 'admin/roster', { csv: roster.join('\n') }, RT);
  ok(r.status === 200 && r.body.created === 31 && r.body.pins.length === 31 && r.body.errors.length === 0, '명단 31명 올리기·PIN 발급', r.body.errors);
  const PIN = {}; r.body.pins.forEach(function (p) { PIN[p.code] = p.pin; });
  ok(PIN['L' + RUN + '01'] === '4321' && /^\d{4}$/.test(PIN['E' + RUN + '01']), '지정 PIN 유지·새 PIN 4자리');
  const [row] = await sql`select pin_hash from students where code = ${'E' + RUN + '01'}`;
  ok(row.pin_hash.indexOf(PIN['E' + RUN + '01']) < 0 && row.pin_hash.indexOf('s1$') === 0, 'PIN은 해시로만 저장');
  const E1 = 'E' + RUN + '01', E2 = 'E' + RUN + '02', C1 = 'C' + RUN + '01', C2 = 'C' + RUN + '02', LATE = 'L' + RUN + '01';

  // ---------- 학생 로그인 ----------
  r = await call('POST', 'login/student', { session_code: S, student_code: E1, pin: '0000' === PIN[E1] ? '1111' : '0000' }); ok(r.status === 401, '틀린 PIN 거부');
  r = await call('POST', 'login/student', { session_code: S2, student_code: E1, pin: PIN[E1] }); ok(r.status === 403 && r.body.code === 'not_in_class', '다른 반 수업 입장 거부');
  r = await call('POST', 'login/student', { session_code: 'NOPE', student_code: E1, pin: PIN[E1] }); ok(r.status === 404, '없는 수업 코드');
  for (let i = 0; i < 5; i++) await call('POST', 'login/student', { session_code: S, student_code: E2, pin: PIN[E2] === '9999' ? '9998' : '9999' });
  r = await call('POST', 'login/student', { session_code: S, student_code: E2, pin: PIN[E2] }); ok(r.status === 423, '5번 틀리면 잠김(맞는 PIN도 거부)');
  r = await call('POST', 'admin/student', { code: E2, reset_pin: true }, RT); ok(r.status === 200 && /^\d{4}$/.test(r.body.pin), '연구자 PIN 재발급·잠금 해제'); PIN[E2] = r.body.pin;
  const tok = {}, meOf = {};
  for (const code of [E1, E2, C1, C2]) {
    r = await call('POST', 'login/student', { session_code: S.toLowerCase(), student_code: code.toLowerCase(), pin: PIN[code] });
    ok(r.status === 200 && r.body.me.student.group === (code[0] === 'E' ? 'EXPERIMENT' : 'CONTROL'), '학생 로그인(소문자 코드도) ' + code, r.body);
    tok[code] = r.body.token; meOf[code] = r.body.me;
  }
  ok(JSON.stringify(meOf[E1]).indexOf('rubric') < 0 && meOf[E1].session.settings.aiJudge === undefined, '학생 상태에 내부 설정·기준 없음');

  // ---------- Preview: 제출, 제출 전 도움, 단계 밖 제출 ----------
  r = await call('POST', 'me/help', { item_id: 'PV02' }, tok[E1]);
  ok(r.status === 200 && r.body.messages.length === 1 && /먼저 네 생각/.test(r.body.messages[0].text), 'T16 제출 전 도움 → 수준0 안내');
  r = await call('POST', 'me/submit', { item_id: 'RD01', fields: { angB: '112' } }, tok[E1]); ok(r.status === 409 && r.body.code === 'stage_closed', '열리지 않은 단계 문항 제출 거부');
  r = await call('POST', 'me/submit', { item_id: 'PV01', fields: { text: '   ' } }, tok[E1]); ok(r.status === 400, '빈 답 제출 거부');
  r = await call('POST', 'me/draft', { item_id: 'PV01', draft: { text: '사각형이고 마주 보는', evil: 'x' }, draft_sel: { text: ['side:AB', 'bad:el', 'side:AB'] } }, tok[E1]);
  ok(r.status === 200 && r.body.saved, '임시저장');
  let [st] = await sql`select i.draft, i.draft_sel from item_states i join students s on s.id = i.student_id where s.code = ${E1} and i.item_id = 'PV01'`;
  ok(st.draft.evil === undefined && JSON.stringify(st.draft_sel) === '{"text":["side:AB"]}', '임시저장 값 정리(모르는 칸·도형·중복 제거)', st);
  r = await call('POST', 'me/submit', { item_id: 'PV01', fields: { text: '사각형이고 마주 보는 변이 평행하다' }, selections: { text: ['side:AB', 'side:CD'] } }, tok[E1]);
  ok(r.status === 200 && r.body.item.status === 'clear' && r.body.messages.length === 0, 'Preview 제출(자동 점검 없음)');
  ok(JSON.stringify(r.body).indexOf('CLEAR_INDEPENDENT') < 0, '학생 응답에 판정 상태 노출 없음');

  // ---------- 단계 넘기기: 미제출 문항 닫기 ----------
  r = await call('POST', 'me/stage', { stage: 1 }, tok[E1]); ok(r.status === 403, '시연 제어가 꺼지면 학생은 단계를 못 넘김');
  r = await call('POST', 'staff/stage', { session: S, stage: 2 }, TT); ok(r.status === 200 && r.body.session.stage === 2, '교사가 Read까지 열기(두 단계)');
  const tos = await sql`select data from events where session_id = (select id from sessions where code = ${S}) and event_type = 'TIMEOUT'`;
  const tE1 = tos.filter(function (x) { return x.data.student_id === E1; }).map(function (x) { return x.data.item_id; }).sort();
  ok(tE1.join() === 'PV02,QU01,QU02', '닫힌 단계 미제출 문항 미완료 기록(PV02·QU01·QU02)', tE1);
  r = await call('POST', 'me/submit', { item_id: 'PV02', fields: { text: '늦은 답' } }, tok[E1]); ok(r.status === 409, '닫힌 문항 제출 거부');
  r = await call('POST', 'me/draft', { item_id: 'PV02', draft: { text: '늦은 답' } }, tok[E1]); ok(r.status === 200 && !r.body.saved, '닫힌 문항 임시저장 무시');

  // ---------- 늦게 들어온 학생 ----------
  r = await call('POST', 'login/student', { session_code: S, student_code: LATE, pin: '4321' }); ok(r.status === 200, '늦게 입장');
  const late = await sql`select data from events where event_type = 'TIMEOUT' and student_code = ${LATE}`;
  ok(late.length === 4 && late.every(function (x) { return x.data.transition_reason === 'JOINED_AFTER_STAGE_CLOSED'; }), '늦은 입장: 닫힌 단계 4문항 따로 기록', late.length);
  r = await call('POST', 'login/student', { session_code: S, student_code: LATE, pin: '4321' });
  const late2 = await sql`select count(*)::int as n from events where event_type = 'TIMEOUT' and student_code = ${LATE}`;
  ok(late2[0].n === 4, '다시 들어와도 미완료 기록 중복 없음');

  // ---------- 실험집단 Read 흐름 ----------
  r = await call('POST', 'me/submit', { item_id: 'RD01', fields: { angB: '68', angC: '68', angD: '68' } }, tok[E1]);
  const m1 = r.body.messages;
  ok(r.status === 200 && m1.length === 1 && m1[0].sender === 'AI' && m1[0].text.indexOf('112') < 0, 'T02 모두 68 → 수준1 질문, 정답 없음', r.body);
  r = await call('POST', 'me/help', { item_id: 'RD01' }, tok[E1]);
  ok(r.status === 200 && r.body.messages.length === 1 && r.body.messages[0].text !== m1[0].text, '재제출 전 도움 → 같은 수준 다른 표현');
  r = await call('POST', 'me/submit', { item_id: 'RD01', fields: { angB: '112', angC: '68', angD: '112' }, reason: '각의 위치를 다시 봄' }, tok[E1]);
  ok(r.status === 200 && r.body.item.attempts === 2 && r.body.item.versions.length === 2 && r.body.item.versions[1].reason === '각의 위치를 다시 봄', '재제출·고친 이유');
  r = await call('POST', 'me/submit', { item_id: 'RD01', fields: { angB: '180-68', angC: '68', angD: '112', work: '∠B는 ∠A와 이웃한 각이라 180-68, ∠C는 ∠A와 마주 보는 각이라 크기가 같다, ∠D는 ∠B와 마주 보는 각' } }, tok[E1]);
  ok(r.status === 200 && r.body.item.status === 'clear', '근거 보완 후 해결(동치 식 180-68 인정)');
  const evE1 = (await sql`select data from events where student_code = ${E1} and item_id = 'RD01' order by seq`).map(function (x) { return x.data; });
  const fs = evE1.filter(function (e) { return e.event_type === 'FIRST_SUBMIT'; });
  ok(fs.length === 1 && JSON.parse(fs[0].response_raw).angB === '68', '최초 제출본 보존');
  ok(evE1.filter(function (e) { return e.event_type === 'RESUBMIT'; }).length === 2, '재제출 2건 기록');
  ok(evE1.some(function (e) { return e.event_type === 'STATE_CHANGE' && e.performance_status === 'ASSISTED_SUCCESS'; }), 'ASSISTED_SUCCESS 기록');
  ok(evE1.every(function (e) { return /Z$/.test(e.event_timestamp) && e.app_version && e.bank_version === 'bank-0.2-draft' && e.answer_key_version === '03-2026-10-10'; }), '모든 기록에 UTC 시각·버전');
  ok(evE1.filter(function (e) { return e.event_type === 'FIRST_SUBMIT' || e.event_type === 'RESUBMIT'; }).every(function (e) { return e.prompt_version === 'judge-0.2/bank-0.2-draft/rule-only'; }), 'AI 없이 돌면 prompt_version에 rule-only 표시');

  // 답 요청 반복: 같은 문장 반복 없음
  const ask = [];
  for (const act of ['submit', 'help', 'submit', 'help']) {
    r = act === 'submit' ? await call('POST', 'me/submit', { item_id: 'RD02', fields: { work: '답 알려줘' } }, tok[E1]) : await call('POST', 'me/help', { item_id: 'RD02' }, tok[E1]);
    r.body.messages.forEach(function (m) { if (m.sender === 'AI') ask.push(m.text); });
  }
  ok(ask[0].indexOf('정답은 바로 알려주지 않을게요') === 0 && ask.every(function (t, i) { return i === 0 || t !== ask[i - 1]; }), '답 요청 반복: 같은 문장 연속 없음', ask);

  // ---------- 통제집단: 도움 요청 → 교사 지원 ----------
  r = await call('POST', 'me/submit', { item_id: 'RD01', fields: { angB: '68', angC: '68', angD: '68' } }, tok[C1]);
  ok(r.status === 200 && r.body.messages.length === 0, 'T21 통제 제출 → AI 지원 없음');
  r = await call('POST', 'me/help', { item_id: 'RD01' }, tok[C1]);
  ok(r.status === 200 && r.body.requests.length === 1 && r.body.messages.some(function (m) { return m.sender === 'SYS'; }), '통제 도움 요청 → 대기열·대기 안내');
  r = await call('POST', 'me/help', { item_id: 'RD01' }, tok[C1]); ok(r.body.duplicate === true && r.body.requests.length === 1, '같은 문항 중복 요청 막음');
  r = await call('GET', 'staff/overview?session=' + S, undefined, TT);
  ok(r.status === 200 && r.body.requests.length === 1 && r.body.requests[0].code === C1, '교사 화면 대기열');
  const fp1 = r.body.fp;
  const c1row = r.body.students.filter(function (s) { return s.code === C1; })[0];
  ok(c1row && c1row.items.RD01.a === 1 && c1row.items.RD01.f === 'num_check', '교사 화면: 통제 학생 숫자 확인 표시');
  r = await call('GET', 'staff/overview?session=' + S + '&fp=' + encodeURIComponent(fp1), undefined, TT); ok(r.body.same === true, '바뀐 것 없으면 same');
  r = await call('GET', 'staff/student?session=' + S + '&code=' + C1, undefined, TT);
  ok(r.status === 200 && r.body.items.RD01.options.levels.join() === '1,2,3,4' && r.body.items.RD01.options.suggested === 1, '교사 선택지: 수준 1~4, 권장 1');
  r = await call('GET', 'staff/content', undefined, TT);
  const bank = r.body.bank; ok(bank.length > 100 && bank.every(function (b) { return b.group !== 'EXPERIMENT'; }), '교사용 발문(실험 전용 제외)');
  const entry = bank.filter(function (b) { return b.item === 'RD01' && b.level === 1; })[0];
  r = await call('POST', 'staff/send', { session: S, code: E1, item_id: 'RD01', level: 1, bank_id: entry.id }, TT); ok(r.status === 403, '실험집단 학생에게 교사 지원 거부');
  r = await call('POST', 'staff/send', { session: S, code: C1, item_id: 'RD01', level: 3, bank_id: entry.id }, TT); ok(r.status === 400, '고른 수준과 발문이 안 맞으면 거부');
  r = await call('POST', 'staff/send', { session: S, code: C1, item_id: 'RD01', level: 1, bank_id: entry.id }, TT); ok(r.status === 200 && r.body.ok, '교사 지원 보내기');
  r = await call('GET', 'me/sync?seq=0', undefined, tok[C1]);
  ok(r.body.messages.some(function (m) { return m.sender === 'TEACHER'; }) && r.body.requests.length === 0, '통제 학생이 지원 받음·요청 닫힘');
  const sent = (await sql`select data from events where student_code = ${C1} and event_type = 'SUPPORT_SENT'`).map(function (x) { return x.data; });
  ok(sent.length === 1 && sent[0].support_provider === 'TEACHER' && sent[0].teacher_id === 'T07' && sent[0].support_requested_at && sent[0].support_sent_at && sent[0].transition_reason === 'TEACHER_REPLY', '교사 지원 기록(교사 ID·요청·전송 시각)');
  r = await call('POST', 'staff/send', { session: S, code: C1, item_id: 'RD01', level: 2, custom: '∠A는 68°예요. ∠A와 ∠B의 위치를 볼까요?' }, TT); ok(r.status === 200 && r.body.ok && !r.body.warn, '직접 쓰기: 문제에 나온 숫자는 경고 없음');
  r = await call('POST', 'staff/send', { session: S, code: C1, item_id: 'RD01', level: 2, custom: '∠B는 112도예요' }, TT); ok(r.status === 200 && r.body.warn === 'answer_leak', '직접 쓰기: 정답 노출 경고');
  r = await call('POST', 'staff/send', { session: S, code: C1, item_id: 'RD01', level: 2, custom: '∠B는 112도예요', confirm: true }, TT); ok(r.status === 200 && r.body.ok, '경고 확인 후 보내기');
  const cust = (await sql`select data from events where student_code = ${C1} and event_type = 'SUPPORT_SENT' and data->>'bank_id' = 'CUSTOM'`)[0];
  ok(cust && cust.data.extra.deviation === 'custom_text', '직접 쓰기는 기록에 표시');
  const custs = await sql`select data from events where student_code = ${C1} and event_type = 'SUPPORT_SENT' and data->>'bank_id' = 'CUSTOM' order by seq`;
  ok(custs.length === 2 && custs[1].data.extra.warning === 'answer_leak' && custs[0].data.extra.warning === null, '경고를 무릅쓰고 보낸 사실도 기록', custs.map(function (x) { return x.data.extra; }));
  r = await call('POST', 'staff/send', { session: S, code: C2, item_id: 'RD01', level: 1, bank_id: entry.id }, TT); ok(r.status === 400, '제출 전에는 수준1 이상 못 보냄');
  r = await call('POST', 'staff/send', { session: S, code: C2, item_id: 'RD01', level: 0, bank_id: 'C-PRE_SUBMIT' }, TT);
  ok(r.status === 200 && r.body.message.level === 0 && /먼저 네 생각/.test(r.body.message.text), '제출 전에는 수준0 “먼저 생각 적기”만 보냄');

  // ---------- 화면 기록(교재·붙여넣기) ----------
  r = await call('POST', 'me/event', { type: 'MATERIAL_OPEN', extra: { material: 'L1_parallelogram_properties' } }, tok[E1]); ok(r.status === 200, '교재 열람 기록');
  r = await call('POST', 'me/event', { type: 'PASTE', item_id: 'RD02', extra: { field: 'work', length: 12 } }, tok[E1]); ok(r.status === 200, '붙여넣기 기록');
  r = await call('POST', 'me/event', { type: 'SUPPORT_SENT' }, tok[E1]); ok(r.status === 400, '학생이 지원 기록을 만들 수 없음');
  const mo = (await sql`select data from events where student_code = ${E1} and event_type = 'MATERIAL_OPEN'`)[0].data;
  ok(mo.stage === 'Read' && mo.extra.material === 'L1_parallelogram_properties' && mo.extra.client_ts === null, '교재 기록: 단계는 서버 기준');

  // ---------- 기록 무결성 ----------
  let blocked = false;
  try { await sql`update events set event_type = 'X' where seq = (select min(seq) from events)`; } catch (e) { blocked = /추가만/.test(e.message); }
  ok(blocked, '기록 수정 차단(UPDATE)');
  blocked = false; try { await sql`delete from events where seq = (select min(seq) from events)`; } catch (e) { blocked = /추가만/.test(e.message); }
  ok(blocked, '기록 삭제 차단(DELETE)');
  blocked = false; try { await sql`truncate events`; } catch (e) { blocked = /추가만/.test(e.message); }
  ok(blocked, '기록 비우기 차단(TRUNCATE)');
  const dup = await sql`select event_id, count(*) from events group by event_id having count(*) > 1`;
  ok(dup.length === 0, '이벤트 ID 중복 없음');

  // ---------- 동시 제출(30명 같은 순간) ----------
  const cohort = [];
  for (let i = 3; i <= 15; i++) for (const g of ['E', 'C']) cohort.push(g + RUN + String(i).padStart(2, '0'));
  const toks = await Promise.all(cohort.map(function (code) { return call('POST', 'login/student', { session_code: S, student_code: code, pin: PIN[code] }).then(function (x) { return x.body.token; }); }));
  const t0 = Date.now();
  const res = await Promise.all(toks.map(function (t, i) { return call('POST', 'me/submit', { item_id: 'RD02', fields: { OC: '3', OD: i % 2 ? '4.5' : '3' } }, t); }));
  const ms = Date.now() - t0;
  ok(res.every(function (x) { return x.status === 200; }), '26명 동시 제출 모두 성공 (' + ms + 'ms)', res.filter(function (x) { return x.status !== 200; }).map(function (x) { return x.body; }));
  // 같은 학생이 같은 문항을 동시에 두 번(더블 클릭)
  const dbl = await Promise.all([1, 2, 3].map(function () { return call('POST', 'me/submit', { item_id: 'RD03', fields: { text: '대각선은 서로를 이등분' } }, toks[0]); }));
  const okN = dbl.filter(function (x) { return x.status === 200; }).length;
  const attempts = dbl.filter(function (x) { return x.status === 200; }).map(function (x) { return x.body.item.attempts; }).sort();
  ok(okN >= 1 && dbl.every(function (x) { return x.status === 200 || x.status === 409; }) && new Set(attempts).size === attempts.length, '같은 문항 동시 3회 제출: 회차 겹침 없음', dbl.map(function (x) { return [x.status, x.body.item && x.body.item.attempts]; }));
  const ev3 = await sql`select data->>'attempt_no' as a from events where student_code = ${cohort[0]} and item_id = 'RD03' and event_type in ('FIRST_SUBMIT','RESUBMIT') order by seq`;
  ok(ev3.map(function (x) { return x.a; }).join() === attempts.join(), '기록된 회차 = 저장된 회차', ev3.map(function (x) { return x.a; }));

  // 단계 전환과 제출이 겹쳐도 일관
  const race = await Promise.all([call('POST', 'staff/stage', { session: S, stage: 3 }, TT)].concat(toks.slice(2, 12).map(function (t) { return call('POST', 'me/submit', { item_id: 'RD03', fields: { text: '마주 보는 각' } }, t); })));
  ok(race[0].status === 200 && race.slice(1).every(function (x) { return x.status === 200 || x.status === 409; }), '단계 전환 중 제출: 성공 또는 단계 바뀜 안내만');
  const incons = await sql`select count(*)::int as n from item_states i join sessions s on s.id = i.session_id where s.code = ${S} and i.item_id like 'RD%' and i.rec->>'status' in ('open') and (i.rec->>'attempts')::int >= 0`;
  ok(incons[0].n === 0, 'Read 문항은 모두 닫힘·해결·미해결 중 하나(열린 채 남지 않음)', incons[0].n);

  // ---------- 내보내기 ----------
  r = await fetch(BASE + '/api/v1/admin/export?format=csv&session=' + S, { headers: { Authorization: 'Bearer ' + RT } });
  const raw = Buffer.from(await r.arrayBuffer()), csv = raw.toString('utf8');
  ok(r.status === 200 && /attachment; filename="pq4r_/.test(r.headers.get('content-disposition')) && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, 'CSV 파일 내려받기(엑셀용 BOM)');
  ok(csv.split('\r\n')[0].replace('﻿', '').split(',').slice(0, 30).join() === 'session_id,student_id,group,lesson,stage,item_id,event_id,event_timestamp,event_type,attempt_no,response_raw,response_math,revision_reason_raw,student_state,state_confidence,support_level_before,support_level_after,support_provider,support_text,support_type,mechanism,performance_status,transition_reason,prompt_version,answer_key_version,teacher_id,support_requested_at,support_sent_at,fading_event,error_flag', 'CSV 머리줄 06 순서');
  r = await fetch(BASE + '/api/v1/admin/backup', { headers: { Authorization: 'Bearer ' + RT } });
  const bk = JSON.parse(await r.text());
  ok(bk.students.length >= 31 && bk.events.length > 50 && JSON.stringify(bk.students).indexOf('pin') < 0, '전체 백업(PIN 제외)');
  r = await call('GET', 'admin/fidelity?session=' + S, undefined, RT);
  ok(r.status === 200 && r.body.controlAI === 0 && r.body.preSubmitMath === 0 && r.body.capViolations === 0 && r.body.supportCount.TEACHER === 3, '처치충실도 계산', r.body);
  r = await call('GET', 'admin/events?session=' + S, undefined, RT);
  const rv = r.body.events.filter(function (e) { return e.event_type === 'FIRST_SUBMIT'; })[0];
  r = await call('POST', 'admin/review', { session: S, target: rv.event_id, state: 'PARTIAL' }, RT); ok(r.status === 200, '사람 코딩 저장');
  r = await call('POST', 'admin/review', { session: S, target: rv.event_id, state: 'NOPE' }, RT); ok(r.status === 400, '없는 상태 코딩 거부');

  // ---------- 설정·종료 ----------
  r = await call('POST', 'admin/session/update', { session: S, key: 'aiPhrase', value: 'yes' }, RT); ok(r.status === 200 && r.body.session.settings.aiPhrase === true, '설정 바꾸기(불리언 정리)');
  r = await call('POST', 'admin/session/update', { session: S, key: 'evil', value: 1 }, RT); ok(r.status === 400, '없는 설정 거부');
  r = await call('POST', 'admin/session/update', { session: S, status: 'closed' }, RT); ok(r.status === 200 && r.body.session.status === 'closed', '수업 끝내기');
  r = await call('POST', 'me/submit', { item_id: 'RF01', fields: { judgment: 'x' } }, tok[E1]); ok(r.status === 409, '끝난 수업 제출 거부');
  r = await call('POST', 'login/student', { session_code: S, student_code: E1, pin: PIN[E1] }); ok(r.status === 404, '끝난 수업 입장 거부');
  r = await call('POST', 'admin/roster', { csv: E1 + ',통제,C' + RUN }, RT); ok(r.body.errors.length === 1 && /집단은 바꿀 수 없/.test(r.body.errors[0].error), '수업에 들어온 학생의 집단 변경 거부');
  r = await call('POST', 'admin/student', { code: E1, active: false }, RT); ok(r.status === 200, '학생 사용 중지');
  r = await call('GET', 'me', undefined, tok[E1]); ok(r.status === 401, '중지된 학생 토큰 거부');

  // 교직원 잠금은 틀린 기기(IP)에만
  async function staffFrom(ip, pw) { const r2 = await fetch(BASE + '/api/v1/login/staff', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip }, body: JSON.stringify({ role: 'teacher', password: pw }) }); return r2.status; }
  for (let i = 0; i < 8; i++) await staffFrom('203.0.113.9', 'wrong-password');
  ok(await staffFrom('203.0.113.9', TPW) === 423, '교사 비밀번호 8번 틀린 기기는 잠김');
  ok(await staffFrom('198.51.100.7', TPW) === 200, '다른 기기의 교사 로그인은 막히지 않음');

  // keepalive
  r = await fetch(BASE + '/api/keepalive'); ok(r.status === 401, '점검 작업: 비밀값 없으면 거부');
  r = await fetch(BASE + '/api/keepalive', { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } }); ok(r.status === 200, '점검 작업: 기록 남김');

  // 보안 헤더
  r = await fetch(BASE + '/');
  ok(/script-src 'self'/.test(r.headers.get('content-security-policy') || '') && r.headers.get('x-frame-options') === 'DENY', '보안 헤더(CSP·프레임 차단)');

  console.log(pass + ' 통과, ' + fail + ' 실패');
  fails.forEach(function (f) { console.log('FAIL ' + f); });
  await sql.end();
  process.exit(fail ? 1 : 0);
})().catch(async function (e) { console.error(e); await sql.end(); process.exit(2); });
