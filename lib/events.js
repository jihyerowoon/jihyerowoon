/* 연구 기록(06 로그 사전 30개 + 추가 항목) 만들기·저장·CSV */
'use strict';
const C = require('./content');
const ai = require('./ai');
const { nowIso, uid } = require('./util');
const V = C.VERSIONS;

const LOG_FIELDS = ['session_id', 'student_id', 'group', 'lesson', 'stage', 'item_id', 'event_id', 'event_timestamp', 'event_type', 'attempt_no',
  'response_raw', 'response_math', 'revision_reason_raw', 'student_state', 'state_confidence', 'support_level_before', 'support_level_after',
  'support_provider', 'support_text', 'support_type', 'mechanism', 'performance_status', 'transition_reason', 'prompt_version',
  'answer_key_version', 'teacher_id', 'support_requested_at', 'support_sent_at', 'fading_event', 'error_flag'];
const EXTRA_FIELDS = ['support_trigger', 'bank_id', 'judge_source', 'judge_agreement', 'misconception', 'needs_review', 'incomplete',
  'app_version', 'bank_version', 'writer', 'extra'];

/* ctx: { session: 행, student: 행|null, writer: 'STUDENT'|'TEACHER'|'RESEARCHER'|'SYSTEM', teacherId } */
function make(type, ctx, o) {
  const g = (o && o.group !== undefined) ? o.group : (ctx.student ? ctx.student.grp : null);
  const pv = g === 'EXPERIMENT' ? V.prompt + '/' + V.bank + (ai.configured() ? '/' + ai.model() : '/rule-only') : null;
  return Object.assign({
    session_id: ctx.session ? ctx.session.code : null, student_id: ctx.student ? ctx.student.code : null, group: g || null,
    lesson: ctx.session ? ctx.session.lesson : 1, stage: null, item_id: null,
    event_id: uid('ev-'), event_timestamp: nowIso(), event_type: type, attempt_no: null, response_raw: null, response_math: null,
    revision_reason_raw: null, student_state: null, state_confidence: null, support_level_before: null, support_level_after: null,
    support_provider: 'NONE', support_text: null, support_type: null, mechanism: null, performance_status: null, transition_reason: null,
    prompt_version: pv, answer_key_version: V.answer_key, teacher_id: ctx.teacherId || null,
    support_requested_at: null, support_sent_at: null, fading_event: null, error_flag: false,
    support_trigger: null, bank_id: null, judge_source: null, judge_agreement: null, misconception: null, needs_review: false,
    incomplete: false, app_version: V.app, bank_version: V.bank, writer: ctx.writer || null, extra: null
  }, o || {});
}

async function insert(tx, sessionId, list) {
  if (!list.length) return;
  const rows = list.map(function (e) {
    return { event_id: e.event_id, session_id: sessionId || null, student_code: e.student_id || null, event_type: e.event_type, item_id: e.item_id || null, server_ts: e.event_timestamp, data: tx.json(e) };
  });
  await tx`insert into events ${tx(rows, 'event_id', 'session_id', 'student_code', 'event_type', 'item_id', 'server_ts', 'data')}`;
}

function toCSV(events) {
  const cols = LOG_FIELDS.concat(EXTRA_FIELDS);
  function cell(v) {
    if (v == null) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    if (/^[=+@\t\r]/.test(v)) v = "'" + v;              // 스프레드시트 수식 주입 방지
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  return '﻿' + cols.join(',') + '\r\n' + events.map(function (e) { return cols.map(function (c) { return cell(e[c]); }).join(','); }).join('\r\n');
}

module.exports = { LOG_FIELDS, EXTRA_FIELDS, make, insert, toCSV };
