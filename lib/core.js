/* 공통: 설정, 입력 정리, 문항 상태 읽기·쓰기, 단계 닫기 */
'use strict';
const C = require('./content');
const E = require('./engine');
const EV = require('./events');
const { httpError, str, nowIso } = require('./util');

/* controlRF03은 예전 판(평행사변형 1차시)의 설정이다. 예전 수업 기록과 맞추려고 값만 남겨 두고 화면에서는 뺐다 */
const DEFAULT_SETTINGS = { aiJudge: true, aiJudgeTwice: true, aiPhrase: false, controlRF03: 'neutral', fadingPairs: true, demoControls: false, materialsInReflect: false };
const SETTING_TYPES = { aiJudge: 'bool', aiJudgeTwice: 'bool', aiPhrase: 'bool', fadingPairs: 'bool', demoControls: 'bool', materialsInReflect: 'bool', controlRF03: ['neutral', 'original'] };
function settingsOf(session) { return Object.assign({}, DEFAULT_SETTINGS, (session && session.settings) || {}); }
function publicSettings(s) { return { controlRF03: s.controlRF03, materialsInReflect: !!s.materialsInReflect, demoControls: !!s.demoControls }; }
function cleanSetting(key, val) {
  const t = SETTING_TYPES[key];
  if (!t) throw httpError(400, '없는 설정이에요.', 'bad_setting');
  if (t === 'bool') return !!val;
  if (t.indexOf(val) < 0) throw httpError(400, '설정 값이 올바르지 않아요.', 'bad_setting');
  return val;
}

const ELEMENTS = ['pt:A', 'pt:B', 'pt:C', 'pt:D', 'pt:O', 'side:AB', 'side:BC', 'side:CD', 'side:DA', 'ang:A', 'ang:B', 'ang:C', 'ang:D', 'diag:AC', 'diag:BD', 'half:AO', 'half:OC', 'half:BO', 'half:OD'];
const CODE_RE = /^[A-Z0-9_-]{2,20}$/;
const SESSION_RE = /^[A-Z0-9_-]{2,24}$/;
function normCode(v) { return str(v, 40).trim().toUpperCase(); }

function stageIndexOfItem(itemId) { const s = E.ITEM[itemId].stage; for (let i = 0; i < C.STAGES.length; i++) if (C.STAGES[i].id === s) return i; return -1; }
function sanitizeFields(it, raw) {
  const out = {};
  it.fields.forEach(function (f) {
    let v = raw ? raw[f.key] : '';
    if (f.kind === 'choice') v = (f.options || []).some(function (o) { return o.v === v; }) ? v : '';
    else if (f.kind === 'multi') {
      const ok = (f.options || []).map(function (o) { return o.v; });
      const list = (Array.isArray(v) ? v : String(v == null ? '' : v).split(',')).map(function (x) { return String(x).trim(); });
      v = ok.filter(function (o) { return list.indexOf(o) >= 0; }).join(',');
    }
    else v = str(v, 3000);
    out[f.key] = v;
  });
  return out;
}
function sanitizeSel(it, raw) {
  const out = {};
  it.fields.forEach(function (f) {
    if (f.kind === 'choice' || f.kind === 'multi') return;
    const a = raw && Array.isArray(raw[f.key]) ? raw[f.key] : [];
    const u = [];
    a.forEach(function (e) { if (ELEMENTS.indexOf(e) >= 0 && u.indexOf(e) < 0) u.push(e); });
    if (u.length) out[f.key] = u;
  });
  return out;
}
function isBlankFields(fields) { return Object.keys(fields).every(function (k) { return !String(fields[k] == null ? '' : fields[k]).trim(); }); }

function blankState() { return { rec: E.newRec(), draft: {}, draft_sel: {}, versions: [], last_judgment: null, reason: '', rev: -1 }; }
async function loadStates(sql, sessionId, studentId) {
  const rows = await sql`select item_id, rec, draft, draft_sel, versions, last_judgment, reason, rev from item_states where session_id = ${sessionId} and student_id = ${studentId}`;
  const m = {}; rows.forEach(function (r) { m[r.item_id] = r; });
  return m;
}
/* 낙관적 동시성: 읽은 뒤 다른 쓰기가 끼면 false → 다시 계산 */
async function writeState(tx, sessionId, studentId, itemId, st, oldRev) {
  if (oldRev < 0) {
    const r = await tx`insert into item_states (session_id, student_id, item_id, rec, draft, draft_sel, versions, last_judgment, reason, rev)
      values (${sessionId}, ${studentId}, ${itemId}, ${tx.json(st.rec)}, ${tx.json(st.draft || {})}, ${tx.json(st.draft_sel || {})}, ${tx.json(st.versions || [])}, ${st.last_judgment ? tx.json(st.last_judgment) : null}, ${st.reason || ''}, 0)
      on conflict do nothing returning rev`;
    return r.length === 1;
  }
  const r = await tx`update item_states set rec = ${tx.json(st.rec)}, draft = ${tx.json(st.draft || {})}, draft_sel = ${tx.json(st.draft_sel || {})},
      versions = ${tx.json(st.versions || [])}, last_judgment = ${st.last_judgment ? tx.json(st.last_judgment) : null}, reason = ${st.reason || ''},
      rev = rev + 1, updated_at = now()
    where session_id = ${sessionId} and student_id = ${studentId} and item_id = ${itemId} and rev = ${oldRev} returning rev`;
  return r.length === 1;
}
async function insertMessages(tx, list) {
  if (!list.length) return [];
  const rows = list.map(function (m) {
    return { session_id: m.session_id, student_id: m.student_id, item_id: m.item_id, sender: m.sender, level: m.level == null ? null : m.level, text: m.text, bank_id: m.bank_id || null,
      requires_resubmission: !!m.requires_resubmission, ack: !!m.ack, reply_to: m.reply_to || null };
  });
  return tx`insert into messages ${tx(rows, 'session_id', 'student_id', 'item_id', 'sender', 'level', 'text', 'bank_id', 'requires_resubmission', 'ack', 'reply_to')} returning *`;
}
function publicMsg(m) { return { seq: Number(m.seq), id: m.id, item_id: m.item_id, sender: m.sender, text: m.text, at: m.at instanceof Date ? m.at.toISOString() : m.at, requires_resubmission: m.requires_resubmission, ack: m.ack, reply_to: m.reply_to }; }
function staffMsg(m) { return Object.assign(publicMsg(m), { level: m.level, bank_id: m.bank_id }); }
function publicItem(st) { return { draft: st.draft || {}, draft_sel: st.draft_sel || {}, versions: st.versions || [], reason: st.reason || '', status: st.rec.status, attempts: st.rec.attempts }; }

/* 단계 닫기: 지난 단계의 미제출·진행 중 문항을 기록하고 학생 화면에서 잠근다 */
async function closeStagesFor(tx, session, participants, from, to, why) {
  if (to <= from || !participants.length) return;
  const cfg = settingsOf(session);
  const ids = participants.map(function (p) { return p.student_id; });
  const rows = await tx`select student_id, item_id, rec, draft, draft_sel from item_states where session_id = ${session.id} and student_id in ${tx(ids)}`;
  const m = {}; rows.forEach(function (r) { m[r.student_id + '|' + r.item_id] = r; });
  const upserts = [], events = [];
  for (const p of participants) {
    const closed = Array.isArray(p.closed_stages) ? p.closed_stages.slice() : [];
    let changed = false;
    for (let k = from; k < to; k++) {
      if (closed.indexOf(k) >= 0) continue;
      const stageId = C.STAGES[k].id;
      E.itemsForStage(stageId, p.grp, cfg, session.lesson).forEach(function (it) {
        const cur = m[p.student_id + '|' + it.id] || { rec: E.newRec(), draft: {}, draft_sel: {} };
        const hasDraft = Object.keys(cur.draft || {}).some(function (f) { return String(cur.draft[f] || '').trim(); });
        const res = E.onStageClose(cur.rec, { group: p.grp, hasDraft: hasDraft });
        if (!res.events.length) return;
        upserts.push({ session_id: session.id, student_id: p.student_id, item_id: it.id, rec: tx.json(res.rec), draft: tx.json(cur.draft || {}), draft_sel: tx.json(cur.draft_sel || {}), versions: tx.json([]), reason: '', rev: 0 });
        res.events.forEach(function (ev) {
          events.push(EV.make(ev.type, { session: session, student: { code: p.code, grp: p.grp }, writer: 'SYSTEM' }, {
            stage: stageId, item_id: it.id, attempt_no: res.rec.attempts, performance_status: ev.performance, transition_reason: why || ev.reason,
            incomplete: !!ev.incomplete, response_raw: ev.type === 'TIMEOUT' && hasDraft ? JSON.stringify(cur.draft) : null,
            response_math: ev.type === 'TIMEOUT' && hasDraft ? JSON.stringify({ selections: cur.draft_sel || {} }) : null,
            support_level_before: res.rec.level, support_level_after: res.rec.level
          }));
        });
      });
      closed.push(k); changed = true;
    }
    if (changed) await tx`update participants set closed_stages = ${tx.json(closed)} where session_id = ${session.id} and student_id = ${p.student_id}`;
  }
  if (upserts.length) {
    await tx`insert into item_states ${tx(upserts, 'session_id', 'student_id', 'item_id', 'rec', 'draft', 'draft_sel', 'versions', 'reason', 'rev')}
      on conflict (session_id, student_id, item_id) do update set rec = excluded.rec, rev = item_states.rev + 1, updated_at = now()`;
  }
  await EV.insert(tx, session.id, events);
}

async function setStage(sql, sessionId, next, why, ctx) {
  next = Math.max(0, Math.min(5, Number(next) | 0));
  return sql.begin(async function (tx) {
    const [s] = await tx`select * from sessions where id = ${sessionId} for update`;
    if (!s) throw httpError(404, '수업을 찾을 수 없어요.', 'no_session');
    if (s.status !== 'open') throw httpError(409, '끝난 수업이에요.', 'session_closed');
    if (next === s.stage) return s;
    const opened = Object.assign({}, s.stage_opened || {}); opened[next] = nowIso();
    const [ns] = await tx`update sessions set stage = ${next}, stage_opened = ${tx.json(opened)}, stage_rev = stage_rev + 1, rev = rev + 1 where id = ${sessionId} returning *`;
    await EV.insert(tx, s.id, [EV.make('STAGE_OPEN', Object.assign({}, ctx, { session: ns, student: null }), {
      group: null, stage: C.STAGES[next].id, transition_reason: why || 'STAGE_OPENED', extra: { stage_index: next, from_index: s.stage }
    })]);
    if (next > s.stage) {
      const ps = await tx`select p.student_id, p.closed_stages, st.code, st.grp from participants p join students st on st.id = p.student_id where p.session_id = ${sessionId}`;
      await closeStagesFor(tx, ns, ps, s.stage, next, null);
    }
    return ns;
  });
}

function staffSession(s) {
  return { code: s.code, lesson: s.lesson, class_name: s.class_name, stage: s.stage, stage_opened: s.stage_opened || {}, settings: settingsOf(s), status: s.status, stage_rev: s.stage_rev, created_at: s.created_at };
}

module.exports = {
  DEFAULT_SETTINGS, settingsOf, publicSettings, cleanSetting, ELEMENTS, CODE_RE, SESSION_RE, normCode, stageIndexOfItem,
  sanitizeFields, sanitizeSel, isBlankFields, blankState, loadStates, writeState, insertMessages, publicMsg, staffMsg, publicItem,
  closeStagesFor, setStage, staffSession
};
