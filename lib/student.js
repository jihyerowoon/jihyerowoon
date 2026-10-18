/* 학생: 로그인, 상태, 임시저장, 제출, 도움 요청, 화면 기록 */
'use strict';
const C = require('./content');
const E = require('./engine');
const ai = require('./ai');
const EV = require('./events');
const K = require('./core');
const A = require('./auth');
const { db } = require('./db');
const { httpError, str, nowIso } = require('./util');

const TOKEN_TTL = 6 * 3600;
const MAX_FAIL = 5, LOCK_MIN = 10;

async function loadCtx(sql, tok) {
  const [session] = await sql`select * from sessions where id = ${tok.ses}`;
  const [student] = await sql`select id, code, grp, class_name, active from students where id = ${tok.sub}`;
  if (!session || !student || !student.active) throw httpError(401, '다시 로그인해 주세요.', 'unauthorized');
  return { session: session, student: student };
}
function ensureOpen(session) { if (session.status !== 'open') throw httpError(409, '끝난 수업이에요.', 'session_closed'); }
async function touch(sql, sessionId, studentId) {
  await sql`update participants set last_seen = now() where session_id = ${sessionId} and student_id = ${studentId} and last_seen < now() - interval '30 seconds'`;
}

async function login(body) {
  const sql = db();
  const sc = K.normCode(body.session_code), code = K.normCode(body.student_code), pin = str(body.pin, 12).trim();
  if (!K.SESSION_RE.test(sc) || !K.CODE_RE.test(code) || !/^\d{4,8}$/.test(pin)) throw httpError(400, '수업 코드, 학생 코드, PIN(숫자)을 확인해 주세요.', 'bad_input');
  const [session] = await sql`select * from sessions where code = ${sc}`;
  if (!session || session.status !== 'open') throw httpError(404, '수업 코드를 확인해 주세요.', 'no_session');
  const [st] = await sql`select * from students where code = ${code}`;
  if (!st || !st.active) throw httpError(401, '학생 코드나 PIN을 확인해 주세요.', 'bad_login');
  if (st.locked_until && new Date(st.locked_until) > new Date()) throw httpError(423, '로그인을 여러 번 틀려 잠겼어요. 10분 뒤에 다시 하거나 선생님께 알려 주세요.', 'locked');
  if (!A.checkPin(pin, st.pin_hash)) {
    const n = (st.failed_logins || 0) + 1;
    if (n >= MAX_FAIL) await sql`update students set failed_logins = 0, locked_until = now() + ${LOCK_MIN + ' minutes'}::interval where id = ${st.id}`;
    else await sql`update students set failed_logins = ${n} where id = ${st.id}`;
    throw httpError(401, '학생 코드나 PIN을 확인해 주세요.', 'bad_login');
  }
  if (st.failed_logins || st.locked_until) await sql`update students set failed_logins = 0, locked_until = null where id = ${st.id}`;
  if (session.class_name && st.class_name !== session.class_name) throw httpError(403, '이 수업 명단에 없어요. 수업 코드를 선생님께 확인해 주세요.', 'not_in_class');
  await sql.begin(async function (tx) {
    const [s] = await tx`select * from sessions where id = ${session.id} for share`;
    const [p] = await tx`insert into participants (session_id, student_id) values (${s.id}, ${st.id})
      on conflict (session_id, student_id) do update set last_seen = now() returning (xmax = 0) as inserted, closed_stages`;
    await EV.insert(tx, s.id, [EV.make('LOGIN', { session: s, student: st, writer: 'STUDENT' }, { transition_reason: p.inserted ? 'FIRST_JOIN' : 'REJOIN', stage: C.STAGES[s.stage].id, extra: { ua: str(body.ua, 160) || null } })]);
    if (s.stage > 0) await K.closeStagesFor(tx, s, [{ student_id: st.id, code: st.code, grp: st.grp, closed_stages: p.closed_stages || [] }], 0, s.stage, 'JOINED_AFTER_STAGE_CLOSED');
  });
  const token = A.sign({ role: 'student', sub: st.id, ses: session.id, code: st.code, grp: st.grp }, TOKEN_TTL);
  return { token: token, role: 'student', me: await me({ sub: st.id, ses: session.id }) };
}

async function openRequests(sql, sessionId, studentId) {
  const rows = await sql`select id, item_id, stage, requested_at from help_requests where session_id = ${sessionId} and student_id = ${studentId} and answered_at is null order by requested_at`;
  return rows.map(function (r) { return { id: r.id, item_id: r.item_id, stage: r.stage, at: r.requested_at.toISOString() }; });
}

async function me(tok) {
  const sql = db();
  const { session, student } = await loadCtx(sql, tok);
  const states = await K.loadStates(sql, session.id, student.id);
  const items = {}; Object.keys(states).forEach(function (k) { items[k] = K.publicItem(states[k]); });
  const msgs = await sql`select * from messages where session_id = ${session.id} and student_id = ${student.id} order by seq`;
  return {
    student: { code: student.code, group: student.grp },
    session: { code: session.code, lesson: session.lesson, stage: session.stage, stage_opened: session.stage_opened || {}, stage_rev: session.stage_rev, status: session.status, settings: K.publicSettings(K.settingsOf(session)) },
    items: items, messages: msgs.map(K.publicMsg), requests: await openRequests(sql, session.id, student.id),
    msgSeq: msgs.length ? Number(msgs[msgs.length - 1].seq) : 0, server_time: nowIso()
  };
}

async function sync(tok, q) {
  const sql = db();
  const seq = Number(q.seq) || 0;
  const [s] = await sql`select stage, stage_opened, stage_rev, status, settings from sessions where id = ${tok.ses}`;
  if (!s) throw httpError(401, '다시 로그인해 주세요.', 'unauthorized');
  const msgs = await sql`select * from messages where session_id = ${tok.ses} and student_id = ${tok.sub} and seq > ${seq} order by seq limit 100`;
  await touch(sql, tok.ses, tok.sub);
  return {
    stage: s.stage, stage_opened: s.stage_opened || {}, stage_rev: s.stage_rev, status: s.status, settings: K.publicSettings(K.settingsOf(s)),
    messages: msgs.map(K.publicMsg), requests: tok.grp === 'CONTROL' ? await openRequests(sql, tok.ses, tok.sub) : [], server_time: nowIso()
  };
}

async function saveDraft(tok, body) {
  const sql = db();
  const itemId = str(body.item_id, 10);
  if (!E.ITEM[itemId]) throw httpError(400, '없는 문항이에요.', 'bad_item');
  const [s] = await sql`select stage, status, settings from sessions where id = ${tok.ses}`;
  if (!s || s.status !== 'open' || K.stageIndexOfItem(itemId) !== s.stage) return { saved: false };
  const it = E.resolveItem(itemId, tok.grp, K.settingsOf(s));
  const draft = K.sanitizeFields(it, body.draft || {}), sel = K.sanitizeSel(it, body.draft_sel || {}), reason = str(body.reason, 300);
  const r = await sql`insert into item_states (session_id, student_id, item_id, rec, draft, draft_sel, reason)
    values (${tok.ses}, ${tok.sub}, ${itemId}, ${sql.json(E.newRec())}, ${sql.json(draft)}, ${sql.json(sel)}, ${reason})
    on conflict (session_id, student_id, item_id) do update set draft = excluded.draft, draft_sel = excluded.draft_sel, reason = excluded.reason, updated_at = now()
    where item_states.rec->>'status' <> 'incomplete' returning updated_at`;
  await touch(sql, tok.ses, tok.sub);
  return { saved: r.length === 1, at: r.length ? r[0].updated_at.toISOString() : null };
}

/* 지원 출력 → 메시지·기록. AI 다듬기는 트랜잭션 밖에서 미리 해 둔다. */
async function prepareOutputs(o) {
  const msgs = [], events = [], requests = [];
  for (const out of o.outs) {
    if (out.kind === 'system') { msgs.push({ sender: 'SYS', text: out.text, level: null, item_id: o.itemId }); continue; }
    if (out.kind === 'request') { requests.push({ item_id: o.itemId, stage: o.stageId, attempt: o.attemptNo, requested_at: o.reqAt || nowIso() }); continue; }
    if (out.kind !== 'support') continue;
    let text = out.text, blocked = false, info = null;
    if (o.group === 'EXPERIMENT' && o.cfg.aiPhrase && ai.configured() && out.level > 0 && !out.procedural) {
      const key = out.entryId;
      if (!(key in o.phraseCache)) o.phraseCache[key] = await ai.phrase(out.text, o.studentText, o.itemId);
      const ph = o.phraseCache[key];
      if (ph) {
        if (ph.ok) { text = ph.text; info = { template: E.plain(out.text), status: 'used' }; }
        else { blocked = true; info = { template: E.plain(out.text), rejected: ph.text, reason: ph.reason }; }
      }
    }
    const at = nowIso();
    msgs.push({ sender: 'AI', text: text, level: out.level, bank_id: out.entryId, requires_resubmission: !!out.requiresResubmission, ack: !!out.ack, item_id: o.itemId });
    events.push(EV.make('SUPPORT_SENT', o.ctx, {
      stage: o.stageId, item_id: o.itemId, attempt_no: o.attemptNo, support_level_before: o.levelBefore, support_level_after: out.level,
      support_provider: 'AI', support_text: E.plain(text), support_type: out.type, mechanism: out.mechanism, transition_reason: out.reason,
      support_trigger: out.trigger, bank_id: out.entryId, support_requested_at: o.reqAt || null, support_sent_at: at, error_flag: blocked, extra: info
    }));
  }
  return { msgs: msgs, events: events, requests: requests };
}

async function commit(sql, session, student, itemId, next, oldRev, events, prepared) {
  return sql.begin(async function (tx) {
    const [s2] = await tx`select stage, status from sessions where id = ${session.id} for share`;
    if (s2.status !== 'open' || s2.stage !== K.stageIndexOfItem(itemId)) throw httpError(409, '단계가 바뀌었어요. 화면이 곧 새로 고쳐져요.', 'stage_changed');
    const ok = await K.writeState(tx, session.id, student.id, itemId, next, oldRev);
    if (!ok) return null;
    await EV.insert(tx, session.id, events.concat(prepared.events));
    const msgs = await K.insertMessages(tx, prepared.msgs.map(function (m) { return Object.assign({ session_id: session.id, student_id: student.id }, m); }));
    for (const r of prepared.requests) {
      await tx`insert into help_requests (session_id, student_id, item_id, stage, attempt, requested_at) values (${session.id}, ${student.id}, ${r.item_id}, ${r.stage}, ${r.attempt}, ${r.requested_at})`;
    }
    await tx`update participants set last_seen = now() where session_id = ${session.id} and student_id = ${student.id}`;
    return msgs;
  });
}

async function submit(tok, body) {
  const sql = db();
  const { session, student } = await loadCtx(sql, tok);
  ensureOpen(session);
  const itemId = str(body.item_id, 10);
  if (!E.ITEM[itemId]) throw httpError(400, '없는 문항이에요.', 'bad_item');
  if (K.stageIndexOfItem(itemId) !== session.stage) throw httpError(409, '이 단계는 지금 열려 있지 않아요.', 'stage_closed');
  const cfg = K.settingsOf(session), grp = student.grp;
  const it = E.resolveItem(itemId, grp, cfg), stageId = it.stage;
  const fields = K.sanitizeFields(it, body.fields || {}), sel = K.sanitizeSel(it, body.selections || {});
  if (K.isBlankFields(fields)) throw httpError(400, '빈 답은 제출할 수 없어요.', 'empty');
  const reason = str(body.reason, 300).trim();

  // 1층 규칙 판정 → 2층 AI 분류(실험집단, 규칙이 확정하지 못한 경우만)
  const rule = E.judgeRule(itemId, grp, fields, sel, cfg);
  const aiOn = grp === 'EXPERIMENT' && !!cfg.aiJudge && ai.configured() && !rule.decisive;
  let aiRun = null;
  if (aiOn) aiRun = await ai.judge(E.buildJudgePrompt(itemId, grp, fields, sel, cfg), !!cfg.aiJudgeTwice);
  const j = E.combine(itemId, grp, rule, aiRun ? aiRun.results : null, aiOn);
  const studentText = Object.keys(fields).map(function (k) { return fields[k]; }).join(' ');
  const phraseCache = {};
  const ctx = { session: session, student: student, writer: 'STUDENT' };

  for (let attempt = 0; attempt < 3; attempt++) {
    const states = await K.loadStates(sql, session.id, student.id);
    const st = states[itemId] || K.blankState();
    if (st.rec.status === 'incomplete') throw httpError(409, '이 문항은 이미 닫혔어요.', 'item_closed');
    const recs = {}; Object.keys(states).forEach(function (k) { recs[k] = states[k].rec; });
    const attemptNo = st.rec.attempts + 1, levelBefore = st.rec.level;
    const res = E.onSubmit(st.rec, j, { stage: stageId, itemId: itemId, group: grp, settings: cfg, recs: recs });
    const at = nowIso();
    const next = {
      rec: res.rec, draft: fields, draft_sel: sel, reason: '',
      versions: (st.versions || []).concat([{ no: attemptNo, at: at, fields: fields, sel: sel, reason: attemptNo > 1 ? reason : '' }]),
      last_judgment: { state: j.state, misc: j.misc, source: j.source, flag: rule.flag, at: at }
    };
    const events = [EV.make(attemptNo === 1 ? 'FIRST_SUBMIT' : 'RESUBMIT', ctx, {
      stage: stageId, item_id: itemId, attempt_no: attemptNo, response_raw: JSON.stringify(fields), response_math: JSON.stringify({ selections: sel }),
      revision_reason_raw: attemptNo > 1 ? (reason || null) : null, student_state: j.state, misconception: j.misc, judge_source: j.source, judge_agreement: j.agree,
      needs_review: !!j.needsReview, support_level_before: levelBefore, support_level_after: levelBefore,
      performance_status: res.rec.status === 'clear' ? res.rec.performance : null,
      extra: { rule_state: rule.state, rule_decisive: rule.decisive, teacher_flag: rule.flag, ai_model: aiOn ? ai.model() : null, ai_error: aiRun ? aiRun.error : null,
        ai: j.ai ? j.ai.map(function (a) { return a ? { state: a.state, misc: a.misc, evidence: a.evidence } : null; }) : null, client_ts: str(body.client_ts, 40) || null }
    })];
    res.events.forEach(function (ev) {
      if (ev.type === 'LEVEL_CHANGE') events.push(EV.make('LEVEL_CHANGE', ctx, { stage: stageId, item_id: itemId, attempt_no: attemptNo, support_level_before: ev.before, support_level_after: ev.after, transition_reason: ev.reason, student_state: j.state }));
      else events.push(EV.make(ev.type, ctx, { stage: stageId, item_id: itemId, attempt_no: attemptNo, performance_status: ev.performance, fading_event: ev.fading || null, transition_reason: ev.reason, student_state: j.state }));
    });
    const prepared = await prepareOutputs({ outs: res.out, itemId: itemId, stageId: stageId, attemptNo: attemptNo, levelBefore: levelBefore, group: grp, cfg: cfg, studentText: studentText, phraseCache: phraseCache, ctx: ctx });
    const msgs = await commit(sql, session, student, itemId, next, st.rev, events, prepared);
    if (msgs) return { item_id: itemId, item: K.publicItem(next), messages: msgs.map(K.publicMsg), requests: await openRequests(sql, session.id, student.id) };
  }
  throw httpError(409, '같은 문항이 동시에 여러 번 제출되었어요. 다시 눌러 주세요.', 'conflict');
}

async function help(tok, body) {
  const sql = db();
  const { session, student } = await loadCtx(sql, tok);
  ensureOpen(session);
  const itemId = str(body.item_id, 10);
  if (!E.ITEM[itemId]) throw httpError(400, '없는 문항이에요.', 'bad_item');
  if (K.stageIndexOfItem(itemId) !== session.stage) throw httpError(409, '이 단계는 지금 열려 있지 않아요.', 'stage_closed');
  const cfg = K.settingsOf(session), grp = student.grp, stageId = E.ITEM[itemId].stage;
  const ctx = { session: session, student: student, writer: 'STUDENT' };
  const phraseCache = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    const states = await K.loadStates(sql, session.id, student.id);
    const st = states[itemId] || K.blankState();
    if (st.rec.status === 'incomplete') throw httpError(409, '이 문항은 이미 닫혔어요.', 'item_closed');
    if (grp === 'CONTROL') {
      const open = await openRequests(sql, session.id, student.id);
      if (open.some(function (r) { return r.item_id === itemId; })) return { item_id: itemId, item: K.publicItem(st), messages: [], requests: open, duplicate: true };
    }
    const levelBefore = st.rec.level;
    const res = E.onHelp(st.rec, { stage: stageId, itemId: itemId, group: grp });
    const reqAt = nowIso();
    const events = [EV.make('HELP_REQUEST', ctx, { stage: stageId, item_id: itemId, attempt_no: res.rec.attempts, support_level_before: levelBefore, support_requested_at: reqAt, support_trigger: 'STUDENT_REQUEST', extra: { client_ts: str(body.client_ts, 40) || null } })];
    res.events.forEach(function (ev) {
      if (ev.type === 'LEVEL_CHANGE') events.push(EV.make('LEVEL_CHANGE', ctx, { stage: stageId, item_id: itemId, attempt_no: res.rec.attempts, support_level_before: ev.before, support_level_after: ev.after, transition_reason: ev.reason }));
      else events.push(EV.make(ev.type, ctx, { stage: stageId, item_id: itemId, attempt_no: res.rec.attempts, performance_status: ev.performance, transition_reason: ev.reason }));
    });
    const draft = st.draft || {};
    const studentText = Object.keys(draft).map(function (k) { return draft[k]; }).join(' ');
    const prepared = await prepareOutputs({ outs: res.out, itemId: itemId, stageId: stageId, attemptNo: res.rec.attempts, levelBefore: levelBefore, group: grp, cfg: cfg, studentText: studentText, phraseCache: phraseCache, ctx: ctx, reqAt: reqAt });
    const next = Object.assign({}, st, { rec: res.rec });
    const msgs = await commit(sql, session, student, itemId, next, st.rev, events, prepared);
    if (msgs) return { item_id: itemId, item: K.publicItem(next), messages: msgs.map(K.publicMsg), requests: await openRequests(sql, session.id, student.id) };
  }
  throw httpError(409, '요청이 겹쳤어요. 다시 눌러 주세요.', 'conflict');
}

const CLIENT_EVENTS = ['PASTE', 'MATERIAL_OPEN', 'MATERIAL_CLOSE'];
async function clientEvent(tok, body) {
  const sql = db();
  const type = str(body.type, 30);
  if (CLIENT_EVENTS.indexOf(type) < 0) throw httpError(400, '기록할 수 없는 종류예요.', 'bad_event');
  const { session, student } = await loadCtx(sql, tok);
  const itemId = body.item_id && E.ITEM[str(body.item_id, 10)] ? str(body.item_id, 10) : null;
  const x = body.extra || {};
  const extra = { client_ts: str(body.client_ts, 40) || null, viewing_stage: str(body.viewing_stage, 12) || null };
  if (type === 'PASTE') { extra.field = str(x.field, 20); extra.length = Math.max(-1, Math.min(100000, Number(x.length) | 0)); }
  else { extra.material = str(x.material, 60); if (type === 'MATERIAL_CLOSE') extra.seconds = Math.max(0, Math.min(36000, Math.round(Number(x.seconds) || 0))); }
  const ev = EV.make(type, { session: session, student: student, writer: 'STUDENT' }, {
    stage: C.STAGES[session.stage].id, item_id: itemId, transition_reason: type === 'MATERIAL_CLOSE' ? str(x.reason, 20) || null : null, extra: extra
  });
  await sql.begin(async function (tx) { await EV.insert(tx, session.id, [ev]); });
  return { ok: true };
}

async function demoStage(tok, body) {
  const sql = db();
  const { session, student } = await loadCtx(sql, tok);
  if (!K.settingsOf(session).demoControls) throw httpError(403, '이 수업은 교사가 단계를 엽니다.', 'forbidden');
  await K.setStage(sql, session.id, body.stage, 'DEMO_CONTROL', { writer: 'STUDENT' });
  return me(tok);
}

module.exports = { login, me, sync, saveDraft, submit, help, clientEvent, demoStage };
