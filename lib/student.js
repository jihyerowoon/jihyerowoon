/* 학생: 로그인, 상태, 임시저장, 제출, 도움 요청, 화면 기록 */
'use strict';
const C = require('./content');
const E = require('./engine');
const ai = require('./ai');
const EV = require('./events');
const K = require('./core');
const REVIEW = require('./review');
const Clock = require('./clock');
const A = require('./auth');
const { db } = require('./db');
const { httpError, str, nowIso } = require('./util');

const TOKEN_TTL = 6 * 3600;
const MAX_FAIL = 5, LOCK_MIN = 10;

async function loadCtx(sql, tok) {
  const session = await Clock.sync(sql,tok.ses);
  const [student] = await sql`select id, code, grp, class_name, active from students where id = ${tok.sub}`;
  if (!session || !student || !student.active) throw httpError(401, '다시 로그인해 주세요.', 'unauthorized');
  return { session: session, student: student };
}
function ensureOpen(session) { if (session.status !== 'open') throw httpError(409, '끝난 수업이에요.', 'session_closed'); }
/* 문항 ID는 차시마다 다르다. 이 수업(차시)의 문항이 아니면 받지 않는다 */
function itemOf(session, raw) {
  const itemId = str(raw, 10);
  const it = E.ITEM[itemId];
  if (!it || it.lesson !== (Number(session.lesson) || 1)) throw httpError(400, '없는 문항이에요.', 'bad_item');
  return itemId;
}
async function touch(sql, sessionId, studentId) {
  await sql`update participants set last_seen = now() where session_id = ${sessionId} and student_id = ${studentId} and last_seen < now() - interval '30 seconds'`;
}

async function login(body) {
  const sql = db();
  const directSession=K.normCode(body.session_code||'');
  const code = K.normCode(body.student_code);
  const requestedClass = K.normCode(body.class_code || '');
  const sc = requestedClass;
  const byClass = !directSession;
  if (!K.CODE_RE.test(code) || (requestedClass && !K.SESSION_RE.test(requestedClass))) throw httpError(400, '학생 코드를 확인해 주세요.', 'bad_input');
  const [st] = await sql`select * from students where code = ${code}`;
  if (!st || !st.active) throw httpError(401, '등록되지 않은 학생 코드입니다. 선생님께 확인해 주세요.', 'bad_login');
  let session;
  if (!byClass) { [session] = await sql`select * from sessions where code=${directSession}`; if (!session || session.status !== 'open') throw httpError(404, '수업 코드를 확인해 주세요.', 'no_session'); }
  if(byClass){
    if(requestedClass && K.normCode(st.class_name)!==requestedClass)throw httpError(403,'학생 코드가 이 반에 등록되어 있지 않습니다. 반 코드를 확인해 주세요.','not_in_class');
    const rows=await sql`select * from sessions where class_name=${st.class_name} and status='open' order by created_at desc`;
    const candidates=[],waitingSessions=[];
    for(const row of rows){const current=await Clock.sync(sql,row.id);if(Clock.active(current)&&['running','paused','catchup'].includes((current.clock||{}).mode))candidates.push(current);else if(Clock.active(current)&&((current.clock||{}).mode||'waiting')==='waiting')waitingSessions.push(current);}
    if(candidates.length>1)throw httpError(409,'이 반에서 여러 수업이 진행 중입니다. 선생님이 진행할 수업을 정리해야 합니다.','class_ambiguous');
    const selectedWaiting=waitingSessions.filter(s=>(s.clock||{}).ready===true);
    if(!candidates.length&&selectedWaiting.length===1)candidates.push(selectedWaiting[0]);
    if(!candidates.length&&waitingSessions.length===1)candidates.push(waitingSessions[0]);
    if(!candidates.length&&waitingSessions.length>1)throw httpError(409,'준비된 수업이 여러 개입니다. 교사 화면에서 진행할 수업을 선택해 주세요.','class_ambiguous');
    if(!candidates.length)throw httpError(409,'선생님이 수업을 시작할 때까지 기다려 주세요. 시작되면 자동으로 입장합니다.','class_waiting');
    session=candidates[0];
  }

  if(directSession&&body.class_code&&K.normCode(session.class_name)!==K.normCode(body.class_code))throw httpError(403,'배포 링크의 수업 코드가 일치하지 않습니다. 연구자에게 링크를 확인해 주세요.','link_class_mismatch');
  if (session.class_name && st.class_name !== session.class_name) throw httpError(403, '이 수업 명단에 없어요. 수업 코드를 선생님께 확인해 주세요.', 'not_in_class');
  await sql.begin(async function (tx) {
    const [s] = await tx`select * from sessions where id = ${session.id} for share`;
    if(s.status!=='open')throw httpError(409,'수업이 새 시연으로 바뀌었습니다. 다시 입장해 주세요.','session_changed');
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

async function priorReflection(sql, sessionId, studentCode) {
  const [e]=await sql`select data from events where session_id=${sessionId} and student_code=${studentCode} and event_type='REVIEW_POST_REFLECTION' order by seq desc limit 1`;
  if (!e) return null;
  try { return JSON.parse(e.data.response_raw || '{}'); } catch(_) { return null; }
}
async function me(tok) {
  const sql = db();
  const { session, student } = await loadCtx(sql, tok);
  const states = await K.loadStates(sql, session.id, student.id);
  const items = {}; Object.keys(states).forEach(function (k) { items[k] = K.publicItem(states[k]); });
  const msgs = await sql`select * from messages where session_id = ${session.id} and student_id = ${student.id} order by seq`;
  return {
    student: { code: student.code, group: student.grp },
    session: { clock: session.clock || {}, code: session.code, lesson: session.lesson, stage: session.stage, stage_opened: session.stage_opened || {}, stage_rev: session.stage_rev, status: session.status, settings: K.publicSettings(K.settingsOf(session)) },
    items: items, messages: msgs.map(K.publicMsg), requests: await openRequests(sql, session.id, student.id),
    msgSeq: msgs.length ? Number(msgs[msgs.length - 1].seq) : 0, server_time: nowIso(),
    notice: await latestNotice(sql,session.id),
    review: Object.assign(REVIEW.status(session), { reflection: await priorReflection(sql,session.id,student.code) })
  };
}

async function sync(tok, q) {
  const sql = db();
  const seq = Number(q.seq) || 0;
  const {session:s}=await loadCtx(sql,tok);
  if (!s) throw httpError(401, '다시 로그인해 주세요.', 'unauthorized');
  const msgs = await sql`select * from messages where session_id = ${tok.ses} and student_id = ${tok.sub} and seq > ${seq} order by seq limit 100`;
  await touch(sql, tok.ses, tok.sub);
  return {
    clock: s.clock || {}, stage: s.stage, stage_opened: s.stage_opened || {}, stage_rev: s.stage_rev, status: s.status, settings: K.publicSettings(K.settingsOf(s)),
    notice: await latestNotice(sql,tok.ses), messages: msgs.map(K.publicMsg), requests: tok.grp === 'CONTROL' ? await openRequests(sql, tok.ses, tok.sub) : [], server_time: nowIso(), review: REVIEW.status(s)
  };
}

async function saveDraft(tok, body) {
  const sql = db();
  const {session:s}=await loadCtx(sql,tok);
  const itemId=itemOf(s,body.item_id);
  if(E.ITEM[itemId].archived) return {saved:false,archived:true};
  if(s.status!=='open'||K.stageIndexOfItem(itemId)!==s.stage||Clock.active(s)&&(s.clock||{}).mode!=='running') return {saved:false};
  if(s.stage===5&&REVIEW.status(s).unlocked) return {saved:false,locked:true};
  const it=E.resolveItem(itemId,tok.grp,K.settingsOf(s));
  const draft=K.sanitizeFields(it,body.draft||{}),sel=K.sanitizeSel(it,body.draft_sel||{}),reason=str(body.reason,300),question=str(body.question,280);
  return sql.begin(async tx=>{
    const [live]=await tx`select * from sessions where id=${tok.ses} for share`;
    if(live.status!=='open'||live.stage!==K.stageIndexOfItem(itemId)||Clock.active(live)&&((live.clock||{}).mode!=='running'||Date.parse(live.clock.deadline)<=Date.now())||live.stage===5&&REVIEW.status(live).unlocked) return {saved:false};
    const r=await tx`insert into item_states(session_id,student_id,item_id,rec,draft,draft_sel,reason,question_draft)
      values(${tok.ses},${tok.sub},${itemId},${tx.json(E.newRec())},${tx.json(draft)},${tx.json(sel)},${reason},${question})
      on conflict(session_id,student_id,item_id) do update set draft=excluded.draft,draft_sel=excluded.draft_sel,reason=excluded.reason,question_draft=excluded.question_draft,updated_at=now(),rev=item_states.rev+1
      where item_states.rec->>'status'<>'incomplete' returning updated_at`;
    return {saved:r.length===1,at:r.length?r[0].updated_at.toISOString():null};
  });
}

/* 지원 출력 → 메시지·기록. AI 다듬기는 트랜잭션 밖에서 미리 해 둔다. */
async function prepareOutputs(o) {
  const msgs = [], events = [], requests = [];
  for (const out of o.outs) {
    if (out.kind === 'system') { msgs.push({ sender: 'SYS', text: out.text, level: null, item_id: o.itemId }); continue; }
    if (out.kind === 'request') { requests.push({ item_id: o.itemId, stage: o.stageId, attempt: o.attemptNo, requested_at: o.reqAt || nowIso(), question_text: o.studentQuestion || '' }); continue; }
    if (out.kind !== 'support') continue;
    let text = out.text, blocked = false, info = { delivery_mode:'TEXT', support_intensity:1, generated:false };
    // 2026-10-23 연구자 확정: 생성형 발문 재작성은 사용하지 않음. 서버의 승인 은행 텍스트만 보냄.
    // 환경 변수 PQ4R_ENABLE_GENERATION=true가 설정되어도 문장 생성 경로를 호출하지 않는다.
    info.generation_mode = 'BANK_ONLY_LOCKED';
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
    const [s2] = await tx`select * from sessions where id = ${session.id} for share`;
    Clock.assertWriting(s2);
    if(Clock.active(s2) && Date.parse(s2.clock.deadline)<=Date.now()) throw httpError(409,'단계 시간이 끝났어요.','stage_changed');
    if (s2.status !== 'open' || s2.stage !== K.stageIndexOfItem(itemId)) throw httpError(409, '단계가 바뀌었어요. 화면이 곧 새로 고쳐져요.', 'stage_changed');
    if (s2.stage===5 && REVIEW.status(s2).unlocked) throw httpError(409, '해설 공개 이후에는 사전 답변을 수정할 수 없어요.', 'review_feedback_released');
    const ok = await K.writeState(tx, session.id, student.id, itemId, next, oldRev);
    if (!ok) return null;
    await EV.insert(tx, session.id, events.concat(prepared.events));
    const msgs = await K.insertMessages(tx, prepared.msgs.map(function (m) { return Object.assign({ session_id: session.id, student_id: student.id }, m); }));
    // 연구자 승인: 새 제출은 이전 요청을 해결하며, 도움 버튼만 새 요청을 만든다.
    if (events.some(e => ['FIRST_SUBMIT','RESUBMIT'].includes(e.event_type))) {
      const closed = await tx`update help_requests set answered_at=now() where session_id=${session.id} and student_id=${student.id} and item_id=${itemId} and answered_at is null returning id`;
      if(closed.length) await EV.insert(tx,session.id,[EV.make('HELP_REQUEST_RESOLVED',{session,student,writer:'STUDENT'},{item_id:itemId,transition_reason:'ANSWER_RESUBMITTED',extra:{request_ids:closed.map(r=>r.id)}})]);
    }
    for (const r of prepared.requests) {
      await tx`insert into help_requests (session_id, student_id, item_id, stage, attempt, requested_at, question_text) values (${session.id}, ${student.id}, ${r.item_id}, ${r.stage}, ${r.attempt}, ${r.requested_at}, ${r.question_text || ''})`;
    }
    await tx`update participants set last_seen = now() where session_id = ${session.id} and student_id = ${student.id}`;
    return msgs;
  });
}

async function submit(tok, body) {
  const sql = db();
  const { session, student } = await loadCtx(sql, tok);
  ensureOpen(session);
  Clock.assertWriting(session);
  const itemId = itemOf(session, body.item_id);
  if(E.ITEM[itemId] && E.ITEM[itemId].archived) throw httpError(400,'이 문항은 새 Review 구성에서 사용하지 않습니다.','archived_review_item');
  if (K.stageIndexOfItem(itemId) !== session.stage) throw httpError(409, '이 단계는 지금 열려 있지 않아요.', 'stage_closed');
  if (session.stage===5 && REVIEW.status(session).unlocked) throw httpError(409, '해설 공개 전 자기점검 시간이 끝났어요. 이제 해설과 성찰을 확인해 주세요.', 'review_feedback_released');
  const cfg = K.settingsOf(session), grp = student.grp;
  const it = E.resolveItem(itemId, grp, cfg), stageId = it.stage;
  const fields = K.sanitizeFields(it, body.fields || {}), sel = K.sanitizeSel(it, body.selections || {});
  if (session.stage===5 && /RV01$/.test(itemId)) {
    if (!str(fields.text,3000).trim()) throw httpError(400,'풀이 또는 아직 이해하지 못한 점을 먼저 작성해 주세요.','review_answer_required');
    if (!['1','2','3'].includes(String(fields.pre_confidence||''))) throw httpError(400,'정답을 보기 전 자신의 확신 정도를 선택해 주세요.','review_confidence_required');
  }
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
  Clock.assertWriting(session);
  const itemId = itemOf(session, body.item_id);
  if(E.ITEM[itemId] && E.ITEM[itemId].archived) throw httpError(400,'이 문항은 새 Review 구성에서 사용하지 않습니다.','archived_review_item');
  if (K.stageIndexOfItem(itemId) !== session.stage) throw httpError(409, '이 단계는 지금 열려 있지 않아요.', 'stage_closed');
  if (session.stage===5 && REVIEW.status(session).unlocked) throw httpError(409, '해설 공개 후에는 새로운 수학 지원을 요청하지 않아요.', 'review_feedback_released');
  const cfg = K.settingsOf(session), grp = student.grp, stageId = E.ITEM[itemId].stage;
  const studentQuestion=str(body.question,280).trim();
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
    const actionable = res.out.some(function (out) { return out.kind === 'support' || out.kind === 'request'; });
    const events = [EV.make(actionable ? 'HELP_REQUEST' : 'HELP_BLOCKED', ctx, {
      stage: stageId, item_id: itemId, attempt_no: res.rec.attempts,
      support_level_before: levelBefore, support_requested_at: reqAt,
      support_trigger: 'STUDENT_REQUEST', transition_reason: actionable ? 'SUPPORT_REQUESTED' : (res.out[0] && res.out[0].reason || 'NOT_ELIGIBLE'),
      extra: { client_ts: str(body.client_ts, 40) || null, student_question: studentQuestion || null }
    })];
    res.events.forEach(function (ev) {
      if (ev.type === 'LEVEL_CHANGE') events.push(EV.make('LEVEL_CHANGE', ctx, { stage: stageId, item_id: itemId, attempt_no: res.rec.attempts, support_level_before: ev.before, support_level_after: ev.after, transition_reason: ev.reason }));
      else events.push(EV.make(ev.type, ctx, { stage: stageId, item_id: itemId, attempt_no: res.rec.attempts, performance_status: ev.performance, transition_reason: ev.reason }));
    });
    const draft = st.draft || {};
    const studentText = Object.keys(draft).map(function (k) { return draft[k]; }).join(' ');
    const prepared = await prepareOutputs({ outs: res.out, itemId: itemId, stageId: stageId, attemptNo: res.rec.attempts, levelBefore: levelBefore, group: grp, cfg: cfg, studentText: studentText, studentQuestion:studentQuestion, phraseCache: phraseCache, ctx: ctx, reqAt: reqAt });
    const next = Object.assign({}, st, { rec: res.rec });
    const msgs = await commit(sql, session, student, itemId, next, st.rev, events, prepared);
    if (msgs) return { item_id: itemId, item: K.publicItem(next), messages: msgs.map(K.publicMsg), requests: await openRequests(sql, session.id, student.id) };
  }
  throw httpError(409, '요청이 겹쳤어요. 다시 눌러 주세요.', 'conflict');
}


/* 공개 시각은 Review +360초, 성찰은 +600초. 학생 답변은 해설 공개 전 고정한다. */
async function reviewFeedback(tok) {
  const sql=db();
  const {session,student}=await loadCtx(sql,tok);
  if(!REVIEW.status(session).unlocked) throw httpError(403,'Review 시작 6분 후에 두 집단 모두에게 정답과 해설이 열립니다.','review_locked');
  const solutions=REVIEW.publicSolutions(session.lesson);
  const answers=await sql.begin(async function(tx){
    const [p]=await tx`select student_id from participants where session_id=${session.id} and student_id=${student.id} for update`;
    if(!p) throw httpError(403,'이 수업 참여자가 아닙니다.','not_participant');
    const [previous]=await tx`select data from events where session_id=${session.id} and student_code=${student.code} and event_type='REVIEW_PRE_SNAPSHOT' order by seq desc limit 1`;
    if(previous&&previous.data&&previous.data.extra&&previous.data.extra.answers) return previous.data.extra.answers;
    const rows=await tx`select item_id,versions,draft from item_states where session_id=${session.id} and student_id=${student.id}`;
    const mapped={};
    rows.forEach(r=>{
      const vs=Array.isArray(r.versions)?r.versions:[];
      const last=vs.length?vs[vs.length-1]:null;
      mapped[r.item_id]={attempts:vs.length,pre_response:last?last.fields:(r.draft||{}),source:last?'submitted':'saved_draft_only'};
    });
    const snapshot=solutions.map(x=>Object.assign({item_id:x.item_id},mapped[x.item_id]||{attempts:0,pre_response:{},source:'not_submitted'}));
    const ctx={session,student,writer:'STUDENT'};
    await EV.insert(tx,session.id,[
      EV.make('REVIEW_PRE_SNAPSHOT',ctx,{stage:'Review',transition_reason:'BEFORE_FEEDBACK',extra:{answers:snapshot}}),
      EV.make('REVIEW_FEEDBACK_OPEN',ctx,{stage:'Review',transition_reason:'SIX_MINUTES_AFTER_REVIEW_OPEN',extra:{release_at:REVIEW.status(session).release_at}})
    ]);
    return snapshot;
  });
  return {ok:true,server_time:nowIso(),review:REVIEW.status(session),solutions,answers,
    reflection:await priorReflection(sql,session.id,student.code)};
}
async function reviewReflect(tok,body){
  const sql=db();
  const {session,student}=await loadCtx(sql,tok);
  if(!REVIEW.status(session).reflect_unlocked) throw httpError(403,'Review 시작 10분 후 마지막 2분 동안 성찰을 제출할 수 있어요.','reflection_not_open');
  if(Clock.active(session) && !['running','reflection'].includes((session.clock||{}).mode)) throw httpError(409,'지금은 성찰 작성 시간이 아닙니다.','reflection_closed');
  let reflection;
  try{reflection=REVIEW.normalizeReflection(body||{});}catch(err){throw httpError(400,err.message,'bad_reflection');}
  if(reflection.focus_item && !REVIEW.publicSolutions(session.lesson).some(function(x){return x.item_id===reflection.focus_item;})) throw httpError(400,'다른 차시의 문항을 선택했어요.','invalid_review_item');
  return sql.begin(async function(tx){
    const [live]=await tx`select * from sessions where id=${session.id} for share`;
    if(Clock.active(live) && !(live.clock||{}).mode?.match(/^(running|reflection)$/)) throw httpError(409,'성찰 작성 시간이 끝났습니다.','reflection_closed');
    const [p]=await tx`select student_id from participants where session_id=${session.id} and student_id=${student.id} for update`;
    if(!p) throw httpError(403,'이 수업 참여자가 아닙니다.','not_participant');
    const [opened]=await tx`select event_id from events where session_id=${session.id} and student_code=${student.code} and event_type='REVIEW_FEEDBACK_OPEN' limit 1`;
    if(!opened) throw httpError(409,'정답과 해설을 먼저 확인해 주세요.','review_not_viewed');
    const [existing]=await tx`select event_id from events where session_id=${session.id} and student_code=${student.code} and event_type='REVIEW_POST_REFLECTION' limit 1`;
    if(existing) throw httpError(409,'해설 후 성찰이 이미 저장됐어요.','already_reflected');
    await EV.insert(tx,session.id,[EV.make('REVIEW_POST_REFLECTION',{session,student,writer:'STUDENT'},{
      stage:'Review',response_raw:JSON.stringify(reflection),transition_reason:'AFTER_FEEDBACK',extra:{release_at:REVIEW.status(session).release_at}
    })]);
    return {ok:true,saved:reflection,server_time:nowIso()};
  });
}



async function reflectionDraft(tok,body){
  const sql=db(),{session,student}=await loadCtx(sql,tok);
  return sql.begin(async tx=>{
    const [live]=await tx`select * from sessions where id=${session.id} for share`;
    if(!REVIEW.status(live).reflect_unlocked || Clock.active(live)&&!['running','reflection'].includes((live.clock||{}).mode))throw httpError(409,'성찰 작성 시간이 끝났습니다.','reflection_closed');
    const value={understanding:['explain','partial','uncertain'].includes(body.understanding)?body.understanding:'',comparison:str(body.comparison,350)};
    await EV.insert(tx,session.id,[EV.make('REVIEW_REFLECTION_DRAFT',{session:live,student,writer:'STUDENT'},{response_raw:JSON.stringify(value),transition_reason:'AUTOSAVED_REFLECTION',extra:{analysis_phase:'MAIN_TIME'}})]);
    return {saved:true,at:nowIso()};
  });
}

async function latestNotice(sql,id){const [e]=await sql`select event_id,data from events where session_id=${id} and event_type='CLASS_NOTICE' order by seq desc limit 1`;return e?{id:e.event_id,text:e.data.extra.text}:null;}
async function supplements(tok) {
  const sql=db(),{session,student}=await loadCtx(sql,tok);
  if(!['catchup','finished'].includes((session.clock||{}).mode))throw httpError(409,'수업 마지막 보완 시간에 열립니다.','catchup_not_open');
  const states=await K.loadStates(sql,session.id,student.id);
  const saved=await sql`select item_id,fields,updated_at from supplements where session_id=${session.id} and student_id=${student.id}`;
  const items=C.ITEMS.filter(it=>!it.archived&&it.lesson===session.lesson).filter(it=>{const r=states[it.id];return !r||!r.rec.attempts||['incomplete','unresolved','closed'].includes(r.rec.status)||it.fields.some(f=>!String((r.draft||{})[f.key]||'').trim());}).map(it=>({item_id:it.id,original:states[it.id]?K.publicItem(states[it.id]):null,saved:saved.find(x=>x.item_id===it.id)||null}));
  return {items,clock:session.clock,server_time:nowIso()};
}
async function supplement(tok,body) {
  const sql=db(),{session,student}=await loadCtx(sql,tok),itemId=itemOf(session,body.item_id);
  const allowed=await supplements(tok);
  if(!allowed.items.some(it=>it.item_id===itemId))throw httpError(403,'보완 대상 문항이 아닙니다.','not_supplement_item');
  const fields=K.sanitizeFields(E.resolveItem(itemId,student.grp,K.settingsOf(session)),body.fields||{});
  return sql.begin(async tx=>{
    const [live]=await tx`select * from sessions where id=${session.id} for share`;
    if(live.status!=='open'||(live.clock||{}).mode!=='catchup'||Date.parse(live.clock.deadline)<=Date.now())throw httpError(409,'보완 시간이 끝났습니다.','catchup_closed');
    await tx`insert into supplements(session_id,student_id,item_id,fields) values(${session.id},${student.id},${itemId},${tx.json(fields)}) on conflict(session_id,student_id,item_id) do update set fields=excluded.fields,updated_at=now()`;
    await EV.insert(tx,session.id,[EV.make('SUPPLEMENT_SAVED',{session,student,writer:'STUDENT'},{item_id:itemId,response_raw:JSON.stringify(fields),transition_reason:'AFTER_MAIN_TIME',extra:{analysis_phase:'SUPPLEMENT_ONLY',after_answer_release:true}})]);
    return {ok:true,at:nowIso()};
  });
}

/* 교사가 학생의 활동지에서 마지막으로 선택한 문항을 볼 수 있도록 운영 상태만 갱신한다. */
async function focus(tok, body) {
  const sql=db();
  const {session}=await loadCtx(sql,tok);
  const itemId=itemOf(session,body.item_id);
  if(session.status!=='open'||K.stageIndexOfItem(itemId)!==session.stage)return {ok:false};
  const field=str(body.field,30);
  const it=E.resolveItem(itemId,tok.grp,K.settingsOf(session));
  if(!it.fields.some(f=>f.key===field))throw httpError(400,'없는 답안 칸이에요.','bad_field');
  await sql`update participants set focus_item=${itemId},focus_field=${field},focus_at=now(),last_seen=now() where session_id=${session.id} and student_id=${tok.sub}`;
  return {ok:true};
}

const CLIENT_EVENTS = ['PASTE', 'MATERIAL_OPEN', 'MATERIAL_CLOSE', 'VIDEO_OPEN', 'VIDEO_PLAY', 'VIDEO_CLOSE'];
async function clientEvent(tok, body) {
  const sql = db();
  const type = str(body.type, 30);
  if (CLIENT_EVENTS.indexOf(type) < 0) throw httpError(400, '기록할 수 없는 종류예요.', 'bad_event');
  const { session, student } = await loadCtx(sql, tok);
  const rawId = body.item_id ? str(body.item_id, 10) : '';
  const itemId = rawId && E.ITEM[rawId] && E.ITEM[rawId].lesson === (Number(session.lesson) || 1) ? rawId : null;
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

module.exports = { focus,  reflectionDraft, supplements, supplement, login, me, sync, saveDraft, submit, help, clientEvent, demoStage, reviewFeedback, reviewReflect };
