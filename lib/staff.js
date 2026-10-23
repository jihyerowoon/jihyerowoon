/* 교사·연구자 */
'use strict';
const C = require('./content');
const E = require('./engine');
const SUPPORT_POLICY = require('./support_policy');
const ai = require('./ai');
const EV = require('./events');
const K = require('./core');
const A = require('./auth');
const { db } = require('./db');
const { httpError, str, nowIso } = require('./util');

const STAFF_TTL = 12 * 3600, MAX_FAIL = 8, LOCK_MIN = 15;

function clientIp(req) {
  const h = (req && req.headers) || {};
  return String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || (req && req.socket && req.socket.remoteAddress) || 'unknown').trim().slice(0, 64);
}
/* 비밀번호를 틀린 쪽(IP)만 잠근다 — 다른 사람이 교사 로그인을 막을 수 없게 */
async function login(body, req) {
  const sql = db();
  const role = str(body.role, 12);
  if (role !== 'teacher' && role !== 'researcher') throw httpError(400, '역할을 골라 주세요.', 'bad_input');
  const want = role === 'teacher' ? process.env.TEACHER_PASSWORD : process.env.RESEARCHER_PASSWORD;
  if (!want || want.length < 8) throw httpError(500, '서버 설정이 끝나지 않았어요(' + (role === 'teacher' ? 'TEACHER' : 'RESEARCHER') + '_PASSWORD 8자 이상).', 'not_configured');
  const key = 'staff:' + role + ':' + clientIp(req);
  const [f] = await sql`select * from auth_failures where key = ${key}`;
  if (f && f.locked_until && new Date(f.locked_until) > new Date()) throw httpError(423, '이 기기에서 비밀번호를 여러 번 틀려 15분 동안 잠겼어요.', 'locked');
  if (!A.safeEq(str(body.password, 200), want)) {
    const n = ((f && f.count) || 0) + 1;
    await sql`insert into auth_failures (key, count, locked_until, updated_at) values (${key}, ${n >= MAX_FAIL ? 0 : n}, ${n >= MAX_FAIL ? new Date(Date.now() + LOCK_MIN * 60000) : null}, now())
      on conflict (key) do update set count = excluded.count, locked_until = excluded.locked_until, updated_at = now()`;
    throw httpError(401, '비밀번호가 맞지 않아요.', 'bad_login');
  }
  if (f) await sql`delete from auth_failures where key = ${key}`;
  const tid = str(body.teacher_id, 20).trim().toUpperCase() || (role === 'teacher' ? 'T01' : 'R01');
  return { token: A.sign({ role: role, tid: tid }, STAFF_TTL), role: role, tid: tid };
}

async function sessionByCode(sql, code) {
  const sc = K.normCode(code);
  const [s] = await sql`select * from sessions where code = ${sc}`;
  if (!s) throw httpError(404, '수업 코드를 찾을 수 없어요.', 'no_session');
  return s;
}
function staffCtx(tok, session) { return { session: session, student: null, writer: tok.role === 'teacher' ? 'TEACHER' : 'RESEARCHER', teacherId: tok.tid }; }

async function sessions() {
  const sql = db();
  const rows = await sql`select s.*, (select count(*) from participants p where p.session_id = s.id)::int as joined from sessions s order by s.created_at desc limit 200`;
  return { sessions: rows.map(function (s) { return Object.assign(K.staffSession(s), { joined: s.joined }); }) };
}

/* 교사 화면 개요: 바뀐 것이 없으면 same:true만 돌려준다 */
async function overview(q) {
  const sql = db();
  const s = await sessionByCode(sql, q.session);
  const [f] = await sql`select
      (select coalesce(max(updated_at), 'epoch') from item_states where session_id = ${s.id}) as a,
      (select coalesce(max(last_seen), 'epoch') from participants where session_id = ${s.id}) as b,
      (select coalesce(max(seq), 0) from messages where session_id = ${s.id}) as c,
      (select count(*) from help_requests where session_id = ${s.id} and answered_at is null) as d,
      (select count(*) from participants where session_id = ${s.id}) as e`;
  const fp = [s.rev, new Date(f.a).getTime(), new Date(f.b).getTime(), f.c, f.d, f.e].join('|');
  if (q.fp && q.fp === fp) return { same: true, fp: fp };
  const ps = await sql`select st.id, st.code, st.grp, p.joined_at, p.last_seen from participants p join students st on st.id = p.student_id where p.session_id = ${s.id} order by st.code`;
  const its = await sql`select student_id, item_id, rec, draft, last_judgment from item_states where session_id = ${s.id}`;
  const by = {};
  its.forEach(function (r) {
    const drafted = Object.keys(r.draft || {}).some(function (k) { return String(r.draft[k] || '').trim(); });
    (by[r.student_id] = by[r.student_id] || {})[r.item_id] = { s: r.rec.status, a: r.rec.attempts, l: r.rec.level, m: r.rec.maxLevel, sc: r.rec.supportCount, d: drafted, f: r.last_judgment ? r.last_judgment.flag : null };
  });
  const reqs = await sql`select r.id, st.code, r.item_id, r.stage, r.requested_at from help_requests r join students st on st.id = r.student_id where r.session_id = ${s.id} and r.answered_at is null order by r.requested_at`;
  return {
    fp: fp, session: K.staffSession(s), server_time: nowIso(),
    students: ps.map(function (p) { return { code: p.code, group: p.grp, joined_at: p.joined_at.toISOString(), last_seen: p.last_seen.toISOString(), items: by[p.id] || {} }; }),
    requests: reqs.map(function (r) { return { id: r.id, code: r.code, item_id: r.item_id, stage: r.stage, at: r.requested_at.toISOString() }; })
  };
}

async function studentDetail(q) {
  const sql = db();
  const s = await sessionByCode(sql, q.session);
  const [st] = await sql`select id, code, grp from students where code = ${K.normCode(q.code)}`;
  if (!st) throw httpError(404, '학생을 찾을 수 없어요.', 'no_student');
  const states = await K.loadStates(sql, s.id, st.id);
  const items = {};
  Object.keys(states).forEach(function (k) {
    const r = states[k];
    if (!E.ITEM[k]) return;   // 예전 판(0.3.x) 문항 기록은 교사 화면에 보이지 않는다(기록·백업에는 남아 있음)
    items[k] = { rec: r.rec, draft: r.draft, draft_sel: r.draft_sel, versions: r.versions, last_judgment: r.last_judgment, options: E.teacherOptions(r.rec, E.ITEM[k].stage) };
  });
  const msgs = await sql`select * from messages where session_id = ${s.id} and student_id = ${st.id} order by seq`;
  const reqs = await sql`select id, item_id, stage, requested_at, answered_at from help_requests where session_id = ${s.id} and student_id = ${st.id} order by requested_at`;
  return {
    student: { code: st.code, group: st.grp }, items: items, messages: msgs.map(K.staffMsg),
    requests: reqs.map(function (r) { return { id: r.id, item_id: r.item_id, stage: r.stage, at: r.requested_at.toISOString(), answered_at: r.answered_at ? r.answered_at.toISOString() : null }; })
  };
}

async function stage(tok, body) {
  const sql = db();
  const s = await sessionByCode(sql, body.session);
  const ns = await K.setStage(sql, s.id, body.stage, tok.role === 'teacher' ? 'TEACHER_CONTROL' : 'RESEARCHER_CONTROL', staffCtx(tok, s));
  return { session: K.staffSession(ns) };
}

/* 통제집단 교사 지원: 같은 발문 은행에서 고르거나 직접 쓰기(표시됨) */
async function send(tok, body) {
  const sql = db();
  const s = await sessionByCode(sql, body.session);
  if (s.status !== 'open') throw httpError(409, '끝난 수업이에요.', 'session_closed');
  const [st] = await sql`select id, code, grp from students where code = ${K.normCode(body.code)}`;
  if (!st) throw httpError(404, '학생을 찾을 수 없어요.', 'no_student');
  if (st.grp !== 'CONTROL') throw httpError(403, '실험집단 학생은 AI 튜터가 지원해요. 교사는 수학 내용을 보내지 않습니다.', 'experiment_student');
  const itemId = str(body.item_id, 10);
  if (!E.ITEM[itemId] || E.ITEM[itemId].lesson !== (Number(s.lesson) || 1)) throw httpError(400, '없는 문항이에요.', 'bad_item');
  const stg = E.ITEM[itemId].stage, level = Number(body.level) | 0;
  if (level !== 1) throw httpError(400, '실제 지원은 메타인지 질문 한 수준만 가능합니다.', 'single_level_only');
  const mode=body.mode==='custom'?'custom':'bank';
  const proposed=mode==='custom'?str(body.custom,500).trim():'';
  const customCheck=mode==='custom'?SUPPORT_POLICY.validateTeacherQuestion(proposed,itemId,E):null;
  if(customCheck&&!customCheck.ok) throw httpError(400,'발문 검토 필요: 쉬운 질문으로 바꾸고 정답, 숫자 또는 풀이 지시를 빼주세요. ('+customCheck.reason+')','custom_question_rejected');
  const custom=customCheck?customCheck.text:'';
  for (let attempt = 0; attempt < 3; attempt++) {
    const states = await K.loadStates(sql, s.id, st.id);
    const cur = states[itemId] || K.blankState();
    const opt = E.teacherOptions(cur.rec, stg);
    if (!cur.rec.attempts) throw httpError(400, '학생의 최초 답변 제출 후 지원해 주세요.', 'first_submit_required');
    if (cur.rec.supportCount > 0 && cur.rec.lastSupportAttempt >= cur.rec.attempts) throw httpError(400, '지원 후 학생의 재응답 제출이 필요합니다.', 'resubmission_required');
    if (opt.levels.indexOf(level) < 0) throw httpError(400, '이 문항에 보낼 수 없는 수준이에요(제출 전에는 수준 0만).', 'bad_level');
    let entry = null;
    if (!custom) {
      entry = E.bankFor(itemId, level, 'CONTROL').filter(function (b) { return b.id === body.bank_id; })[0];
      if (!entry) throw httpError(400, '보낼 발문을 골라 주세요.', 'no_entry');
    }
    const warning=null; // 자유 발문은 위에서 서버측 엄격 검사, 통과해도 연구자 사후 검토
    const text = custom || entry.text;
    const [req] = await sql`select id, requested_at from help_requests where session_id = ${s.id} and student_id = ${st.id} and item_id = ${itemId} and answered_at is null order by requested_at asc limit 1`;
    if (!req) throw httpError(400, '학생이 도움을 요청한 뒤에만 발문을 보낼 수 있습니다.', 'request_required');
    const before = cur.rec.level || 0;
    const next = Object.assign({}, cur, { rec: E.applyTeacherSupport(cur.rec, level) });
    const at = nowIso();
    const ev = EV.make('SUPPORT_SENT', staffCtx(tok, s), {
      student_id: st.code, group: 'CONTROL', stage: stg, item_id: itemId, attempt_no: cur.rec.attempts || 0,
      support_level_before: before, support_level_after: level, support_provider: 'TEACHER', support_text: E.plain(text),
      support_type: '메타인지', mechanism: '문제화',
      transition_reason: 'TEACHER_REPLY',
      support_trigger: 'STUDENT_REQUEST', bank_id: entry ? entry.id : 'TEACHER_FREEFORM', teacher_id: tok.tid,
      support_requested_at: req ? req.requested_at.toISOString() : null, support_sent_at: at, prompt_version: null,
      extra: custom ? { teacher_question_mode:'FREEFORM', rule_validation:'PASS', review_required:true, delivery_mode:'TEXT', wording_is_teacher_authored:true } : { teacher_question_mode:'BANK', delivery_mode:'TEXT', review_required:false }
    });
    const msg = await sql.begin(async function (tx) {
      const ok = await K.writeState(tx, s.id, st.id, itemId, next, cur.rev);
      if (!ok) return null;
      const [m] = await K.insertMessages(tx, [{ session_id: s.id, student_id: st.id, item_id: itemId, sender: 'TEACHER', level: level, text: text, bank_id: entry ? entry.id : 'TEACHER_FREEFORM', requires_resubmission: level > 0, reply_to: req ? req.id : null }]);
      if (req) await tx`update help_requests set answered_at = now(), answer_message = ${m.id} where id = ${req.id}`;
      await EV.insert(tx, s.id, [ev]);
      return m;
    });
    if (msg) return { ok: true, message: K.staffMsg(msg) };
  }
  throw httpError(409, '학생의 답이 방금 바뀌었어요. 다시 보내 주세요.', 'conflict');
}

/* 교사용 발문(통제집단에 쓸 수 있는 것만) */
function staffContent() {
  return {
    bank: C.BANK.filter(function (b) { return b.level === 1 && !b.group; }).map(function (b) { return { id: b.id, item: b.item, level: b.level, state: b.state, variant: b.variant, text: b.text, type: b.type, mechanism: b.mechanism }; }),
    pre_submit: C.COMMON.PRE_SUBMIT
  };
}

/* ---------------- 연구자 ---------------- */
async function createSession(tok, body) {
  const sql = db();
  const code = K.normCode(body.code);
  if (!K.SESSION_RE.test(code)) throw httpError(400, '수업 코드는 영문 대문자·숫자·-·_ 2~24자로 적어 주세요.', 'bad_input');
  const lesson = Math.max(1, Math.min(8, Number(body.lesson) | 0 || 1));
  if (!C.LESSONS[lesson]) throw httpError(400, '지금은 ' + Object.keys(C.LESSONS).join('·') + '차시만 준비되어 있어요.', 'lesson_not_ready');
  const settings = {};
  Object.keys(body.settings || {}).forEach(function (k) { settings[k] = K.cleanSetting(k, body.settings[k]); });
  const now = nowIso();
  try {
    const [s] = await sql`insert into sessions (code, lesson, class_name, stage, stage_opened, settings) values (${code}, ${lesson}, ${str(body.class_name, 40).trim()}, 0, ${sql.json({ 0: now })}, ${sql.json(settings)}) returning *`;
    await sql.begin(async function (tx) { await EV.insert(tx, s.id, [EV.make('SETTINGS_CHANGE', staffCtx(tok, s), { group: null, transition_reason: 'SESSION_CREATED', extra: { class_name: s.class_name, settings: K.settingsOf(s) } })]); });
    return { session: K.staffSession(s) };
  } catch (e) {
    if (e && e.code === '23505') throw httpError(409, '이미 있는 수업 코드예요.', 'exists');
    throw e;
  }
}

async function updateSession(tok, body) {
  const sql = db();
  const s = await sessionByCode(sql, body.session);
  const changes = {};
  if (body.key) changes[body.key] = K.cleanSetting(body.key, body.value);
  let status = s.status;
  if (body.status === 'closed' || body.status === 'open') status = body.status;
  const settings = Object.assign({}, s.settings || {}, changes);
  const [ns] = await sql`update sessions set settings = ${sql.json(settings)}, status = ${status}, rev = rev + 1, stage_rev = stage_rev + 1 where id = ${s.id} returning *`;
  await sql.begin(async function (tx) {
    await EV.insert(tx, s.id, [EV.make('SETTINGS_CHANGE', staffCtx(tok, ns), { group: null, transition_reason: body.key || ('STATUS_' + status.toUpperCase()), extra: { key: body.key || 'status', value: body.key ? changes[body.key] : status } })]);
  });
  return { session: K.staffSession(ns) };
}

function parseGroup(v) {
  v = String(v || '').trim().toUpperCase();
  if (['E', 'EXP', 'EXPERIMENT', '실험', '실험집단', 'AI'].indexOf(v) >= 0) return 'EXPERIMENT';
  if (['C', 'CON', 'CONTROL', '통제', '통제집단', 'TEACHER'].indexOf(v) >= 0) return 'CONTROL';
  return null;
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); }).filter(function (r) { return r.some(Boolean); });
}

/* 명단 올리기: 코드, 집단, 반, PIN(선택). 새 PIN은 이번 응답에만 보인다. */
async function roster(tok, body) {
  const sql = db();
  const rows = parseCSV(body.csv);
  if (!rows.length) throw httpError(400, '명단이 비어 있어요.', 'empty');
  if (rows.length > 2000) throw httpError(400, '한 번에 2,000명까지 올릴 수 있어요.', 'too_many');
  let start = 0;
  if (/code|코드|학생|id/i.test(rows[0][0])) start = 1;
  const out = { created: 0, updated: 0, unchanged: 0, pins: [], errors: [] };
  const seen = {};
  for (let i = start; i < rows.length; i++) {
    const r = rows[i], line = i + 1;
    const code = K.normCode(r[0]), grp = parseGroup(r[1]), cls = str(r[2], 40).trim(), pinIn = str(r[3], 12).trim();
    if (!K.CODE_RE.test(code)) { out.errors.push({ line: line, code: r[0], error: '학생 코드는 영문·숫자·-·_ 2~20자' }); continue; }
    if (seen[code]) { out.errors.push({ line: line, code: code, error: '명단 안에서 코드가 겹쳐요' }); continue; }
    seen[code] = true;
    if (!grp) { out.errors.push({ line: line, code: code, error: '집단은 실험/통제(E/C)로 적어 주세요' }); continue; }
    if (pinIn && !/^\d{4,8}$/.test(pinIn)) { out.errors.push({ line: line, code: code, error: 'PIN은 숫자 4~8자리' }); continue; }
    const [ex] = await sql`select s.id, s.grp, s.class_name, (select count(*) from participants p where p.student_id = s.id)::int as joined from students s where s.code = ${code}`;
    if (!ex) {
      const pin = pinIn || A.newPin(4);
      await sql`insert into students (code, grp, class_name, pin_hash, pin_enc) values (${code}, ${grp}, ${cls}, ${A.hashPin(pin)}, ${A.sealPin(pin)})`;
      out.created++; out.pins.push({ code: code, group: grp, class_name: cls, pin: pin });
      continue;
    }
    if (ex.grp !== grp && ex.joined > 0) { out.errors.push({ line: line, code: code, error: '이미 수업에 들어온 학생의 집단은 바꿀 수 없어요' }); continue; }
    if (ex.grp !== grp || ex.class_name !== cls || pinIn) {
      if (pinIn) await sql`update students set grp = ${grp}, class_name = ${cls}, pin_hash = ${A.hashPin(pinIn)}, pin_enc = ${A.sealPin(pinIn)}, failed_logins = 0, locked_until = null, updated_at = now() where id = ${ex.id}`;
      else await sql`update students set grp = ${grp}, class_name = ${cls}, updated_at = now() where id = ${ex.id}`;
      out.updated++; if (pinIn) out.pins.push({ code: code, group: grp, class_name: cls, pin: pinIn });
    } else out.unchanged++;
  }
  await sql.begin(async function (tx) {
    await EV.insert(tx, null, [EV.make('SETTINGS_CHANGE', { session: null, student: null, writer: 'RESEARCHER', teacherId: tok.tid }, { group: null, transition_reason: 'ROSTER_UPLOAD', extra: { created: out.created, updated: out.updated, errors: out.errors.length } })]);
  });
  return out;
}

async function students() {
  const sql = db();
  const rows = await sql`select s.code, s.grp, s.class_name, s.active, s.locked_until, s.created_at, s.pin_enc,
      (select count(*) from participants p where p.student_id = s.id)::int as sessions from students s order by s.class_name, s.code`;
  // PIN은 연구자 화면에서만 보인다(이 API는 연구자 전용). 예전 방식으로 저장돼 암호문이 없으면 null → 'PIN 새로'로 다시 만든다.
  return { students: rows.map(function (r) { return { code: r.code, group: r.grp, class_name: r.class_name, active: r.active, locked: !!(r.locked_until && new Date(r.locked_until) > new Date()), sessions: r.sessions, pin: A.openPin(r.pin_enc) }; }) };
}

async function studentUpdate(tok, body) {
  const sql = db();
  const code = K.normCode(body.code);
  const [st] = await sql`select id from students where code = ${code}`;
  if (!st) throw httpError(404, '학생을 찾을 수 없어요.', 'no_student');
  let pin = null;
  if (body.reset_pin) { pin = A.newPin(4); await sql`update students set pin_hash = ${A.hashPin(pin)}, pin_enc = ${A.sealPin(pin)}, failed_logins = 0, locked_until = null, updated_at = now() where id = ${st.id}`; }
  if (typeof body.active === 'boolean') await sql`update students set active = ${body.active}, updated_at = now() where id = ${st.id}`;
  await sql.begin(async function (tx) {
    await EV.insert(tx, null, [EV.make('SETTINGS_CHANGE', { session: null, student: { code: code, grp: null }, writer: 'RESEARCHER', teacherId: tok.tid }, { group: null, transition_reason: body.reset_pin ? 'PIN_RESET' : 'STUDENT_ACTIVE', extra: { active: typeof body.active === 'boolean' ? body.active : undefined } })]);
  });
  return { code: code, pin: pin };
}

async function events(q) {
  const sql = db();
  let rows;
  if (q.session && q.session !== 'ALL') { const s = await sessionByCode(sql, q.session); rows = await sql`select data from events where session_id = ${s.id} order by seq`; }
  else rows = await sql`select data from events order by seq`;
  return rows.map(function (r) { return r.data; });
}

async function exportData(q) {
  const evs = await events(q);
  const name = 'pq4r_' + (q.session || 'ALL') + '_' + new Date().toISOString().slice(0, 10);
  if (q.format === 'json') return { filename: name + '_events.json', type: 'application/json', text: JSON.stringify(evs, null, 1) };
  return { filename: name + '_events.csv', type: 'text/csv', text: EV.toCSV(evs) };
}

/* 전체 백업(무료 플랜은 자동 백업이 없어서) */
async function backup() {
  const sql = db();
  const out = { exported_at: nowIso(), versions: C.VERSIONS };
  out.students = await sql`select code, grp, class_name, active, created_at from students order by code`;
  out.sessions = await sql`select code, lesson, class_name, stage, stage_opened, settings, status, created_at from sessions order by created_at`;
  out.participants = await sql`select se.code as session, st.code as student, p.joined_at, p.last_seen, p.closed_stages from participants p join sessions se on se.id = p.session_id join students st on st.id = p.student_id`;
  out.item_states = await sql`select se.code as session, st.code as student, i.item_id, i.rec, i.draft, i.draft_sel, i.versions, i.last_judgment, i.updated_at from item_states i join sessions se on se.id = i.session_id join students st on st.id = i.student_id`;
  out.messages = await sql`select se.code as session, st.code as student, m.seq, m.item_id, m.sender, m.level, m.text, m.bank_id, m.at from messages m join sessions se on se.id = m.session_id join students st on st.id = m.student_id order by m.seq`;
  out.help_requests = await sql`select se.code as session, st.code as student, h.item_id, h.stage, h.attempt, h.requested_at, h.answered_at from help_requests h join sessions se on se.id = h.session_id join students st on st.id = h.student_id`;
  out.events = (await sql`select data from events order by seq`).map(function (r) { return r.data; });
  return { filename: 'pq4r_backup_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json', type: 'application/json', text: JSON.stringify(out) };
}

async function fidelity(q) { return E.fidelity(await events(q)); }

async function review(tok, body) {
  const sql = db();
  const s = await sessionByCode(sql, body.session);
  const target = str(body.target, 60), state = str(body.state, 30);
  if (Object.keys(C.STATES).indexOf(state) < 0) throw httpError(400, '상태를 골라 주세요.', 'bad_state');
  const [src] = await sql`select data from events where event_id = ${target} and session_id = ${s.id}`;
  if (!src) throw httpError(404, '검토할 기록을 찾을 수 없어요.', 'no_event');
  const d = src.data;
  await sql.begin(async function (tx) {
    await EV.insert(tx, s.id, [EV.make('TEACHER_REVIEW', staffCtx(tok, s), { student_id: d.student_id, group: d.group, stage: d.stage, item_id: d.item_id, attempt_no: d.attempt_no, student_state: state, transition_reason: 'HUMAN_CODING', extra: { target: target, auto_state: d.student_state, coder: tok.tid } })]);
  });
  return { ok: true };
}

function bankAll() {
  return { bank: C.BANK.filter(function (b) { return b.level === 1 && !b.group; }), common: C.COMMON, excluded: C.EXCLUDED, rubric: C.RUBRIC, states: C.STATES, material_notes: C.MATERIAL_NOTES, fixed_ai: C.FIXED_AI, keys: C.KEYS,
    caps: C.STAGES.map(function (s) { return { id: s.id, cap: s.cap }; }), versions: C.VERSIONS };
}

async function status() {
  const sql = db();
  const t0 = Date.now();
  const [c] = await sql`select (select count(*) from students)::int as students, (select count(*) from sessions)::int as sessions, (select count(*) from events)::int as events, (select at from heartbeat where id = 1) as heartbeat, pg_database_size(current_database())::bigint as bytes`;
  return {
    db: { ok: true, ms: Date.now() - t0, students: c.students, sessions: c.sessions, events: c.events, heartbeat: c.heartbeat ? c.heartbeat.toISOString() : null, size_mb: Math.round(Number(c.bytes) / 1048576 * 10) / 10 },
    ai: { configured: ai.configured(), model: ai.configured() ? ai.model() : null, effort: ai.effort() },
    env: { teacher_password: !!process.env.TEACHER_PASSWORD, researcher_password: !!process.env.RESEARCHER_PASSWORD, cron_secret: !!process.env.CRON_SECRET, region: process.env.VERCEL_REGION || null },
    versions: C.VERSIONS, server_time: nowIso()
  };
}

async function aiTest() {
  if (!ai.configured()) throw httpError(400, 'ANTHROPIC_API_KEY가 설정되지 않았어요. AI 없이 규칙 판정만 쓰입니다.', 'ai_not_configured');
  const fields = { text: '마주 보는 두 변의 길이는 각각 같고, 마주 보는 두 각의 크기도 각각 같다. 두 대각선은 서로를 이등분한다.' };
  const t0 = Date.now();
  const r = await ai.judge(E.buildJudgePrompt('L2RC02', 'EXPERIMENT', fields, {}, K.DEFAULT_SETTINGS), true);
  return { ms: Date.now() - t0, model: ai.model(), results: r.results, error: r.error, expected: 'CLEAR_INDEPENDENT' };
}

module.exports = { login, sessions, overview, studentDetail, stage, send, staffContent, createSession, updateSession, roster, students, studentUpdate, events, exportData, backup, fidelity, review, bankAll, status, aiTest, parseCSV };
