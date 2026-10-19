/* Claude API 호출(서버 전용). 키가 없으면 AI를 쓰지 않고 규칙 판정만 한다.
 * 학생 이름·코드는 보내지 않는다. 보내는 것은 문항·기준·학생이 쓴 답 글뿐이다. */
'use strict';
const E = require('./engine');

let client = null;
function configured() { return !!process.env.ANTHROPIC_API_KEY; }
function model() { return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'; }
function effort() { return process.env.ANTHROPIC_EFFORT || 'medium'; }
function getClient() {
  if (client) return client;
  const mod = require('@anthropic-ai/sdk');
  const Anthropic = mod.Anthropic || mod.default || mod;
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 };
  if (process.env.ANTHROPIC_BASE_URL) opts.baseURL = process.env.ANTHROPIC_BASE_URL;
  client = new Anthropic(opts);
  return client;
}

const STATE_KEYS = ['CLEAR_INDEPENDENT', 'CORRECT_NO_REASON', 'PARTIAL', 'MISAPPLIED_PROPERTY', 'AMBIGUOUS', 'NO_START', 'INVALID_RESPONSE', 'REFLECT_UNCRITICAL', 'SELF_REPORT_UNCERTAIN'];
const PROP_KEYS = E.PROP_KEYS;
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    state: { type: 'string', enum: STATE_KEYS },
    misconception: { type: 'string' },
    missing: { type: 'array', items: { type: 'string', enum: PROP_KEYS } },
    evidence: { type: 'string' }
  },
  required: ['state', 'misconception', 'missing', 'evidence']
};
const PHRASE_SCHEMA = { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] };

async function callJSON(prompt, schema, timeoutMs) {
  const r = await getClient().messages.create({
    model: model(),
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: effort(), format: { type: 'json_schema', schema: schema } }
  }, { timeout: timeoutMs || 20000 });
  if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return null;
  const block = (r.content || []).find(function (b) { return b.type === 'text'; });
  if (!block) return null;
  try { return JSON.parse(block.text); } catch (e) { return null; }
}

/* 판정: twice면 두 번 따로 부른다(캐시 없음). 실패는 null로 돌려 결합 규칙이 처리한다. */
async function judge(prompt, twice) {
  if (!configured()) return { results: null, error: 'not_configured' };
  const one = function () { return callJSON(prompt, JUDGE_SCHEMA, 20000).then(E.parseJudge).catch(function (e) { return { _error: errCode(e) }; }); };
  const runs = await Promise.all(twice ? [one(), one()] : [one()]);
  const errs = runs.filter(function (r) { return r && r._error; }).map(function (r) { return r._error; });
  return { results: runs.map(function (r) { return r && !r._error ? r : null; }), error: errs.length ? errs[0] : null };
}

async function phrase(template, studentText, itemId) {
  if (!configured()) return null;
  try {
    const o = await callJSON(E.buildPhrasePrompt(template, studentText), PHRASE_SCHEMA, 15000);
    const t = o && o.text ? String(o.text) : '';
    const chk = E.checkOutput(t, template, studentText, itemId);
    return chk.ok ? { ok: true, text: t } : { ok: false, text: t, reason: chk.reason };
  } catch (e) { return null; }
}

function errCode(e) {
  if (!e) return 'unknown';
  if (e.status === 429) return 'rate_limited';
  if (e.status === 401 || e.status === 403) return 'auth';
  if (e.status === 400) return 'bad_request';
  if (e.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(String(e.message))) return 'timeout';
  return 'api_error';
}

module.exports = { configured, model, effort, judge, phrase, JUDGE_SCHEMA };
