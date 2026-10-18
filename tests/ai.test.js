/* AI 경로 시험: 가짜 Claude API 서버를 띄우고, 서버가 ANTHROPIC_BASE_URL로 그곳을 부르게 해서 판정·결합·차단을 확인한다.
 * 사용: run-local.sh가 띄운다(MOCK_PORT, TEST_BASE_AI). */
'use strict';
const http = require('http');
const postgres = require('postgres');
const BASE = process.env.TEST_BASE_AI || 'http://localhost:3202';
const MOCK_PORT = Number(process.env.MOCK_PORT || 3301);
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, onnotice: function () { } });
let pass = 0, fail = 0; const fails = [];
function ok(c, name, extra) { if (c) pass++; else { fail++; fails.push(name + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 600) : '')); } }

/* 가짜 API: 학생 답에 들어 있는 표시어로 응답을 고른다 */
const calls = []; let alt = 0;
function reply(res, status, obj, headers) { res.writeHead(status, Object.assign({ 'content-type': 'application/json' }, headers || {})); res.end(JSON.stringify(obj)); }
function msg(model, text) { return { id: 'msg_test', type: 'message', role: 'assistant', model: model, content: [{ type: 'text', text: text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } }; }
const mock = http.createServer(function (req, res) {
  let b = ''; req.on('data', function (c) { b += c; }); req.on('end', function () {
    let body = {}; try { body = JSON.parse(b); } catch (e) { /* ignore */ }
    const prompt = (body.messages && body.messages[0] && body.messages[0].content) || '';
    calls.push({ path: req.url, key: req.headers['x-api-key'], body: body, prompt: prompt });
    if (req.url.indexOf('/v1/messages') !== 0) return reply(res, 404, {});
    if (/기본 문장:/.test(prompt)) {   // 문장 다듬기
      if (/LEAKPHRASE/.test(prompt)) return reply(res, 200, msg(body.model, JSON.stringify({ text: '∠B는 112도예요. 다시 보세요.' })));
      return reply(res, 200, msg(body.model, JSON.stringify({ text: '네가 쓴 생각을 바탕으로, 각의 위치를 다시 살펴볼까요?' })));
    }
    if (/AIFAIL/.test(prompt)) return reply(res, 500, { type: 'error', error: { type: 'api_error', message: 'boom' } });
    if (/AILIMIT/.test(prompt)) return reply(res, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '0' });
    if (/AIDISAGREE/.test(prompt)) { alt++; return reply(res, 200, msg(body.model, JSON.stringify({ state: alt % 2 ? 'CLEAR_INDEPENDENT' : 'PARTIAL', misconception: '', missing: [], evidence: 'e' + alt }))); }
    if (/AIAGREE/.test(prompt)) return reply(res, 200, msg(body.model, JSON.stringify({ state: 'PARTIAL', misconception: 'missing_adj', missing: ['P_ADJ_180'], evidence: '이웃각 근거 없음' })));
    return reply(res, 200, msg(body.model, JSON.stringify({ state: 'CLEAR_INDEPENDENT', misconception: '', missing: [], evidence: '세 성질 모두 언급' })));
  });
});

async function call(method, path, body, tok) {
  const h = { 'Content-Type': 'application/json' }; if (tok) h.Authorization = 'Bearer ' + tok;
  const r = await fetch(BASE + '/api/v1/' + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const RUN = 'A' + Date.now().toString(36).toUpperCase().slice(-4);

(async function () {
  await new Promise(function (r) { mock.listen(MOCK_PORT, r); });
  let r = await call('POST', 'login/staff', { role: 'researcher', password: process.env.RESEARCHER_PASSWORD }); const RT = r.body.token;
  r = await call('POST', 'admin/session', { code: RUN, lesson: 1, settings: { demoControls: true } }, RT); ok(r.status === 200, 'AI 시험 수업');
  r = await call('POST', 'admin/roster', { csv: RUN + 'E1,실험,,1234\n' + RUN + 'C1,통제,,1234' }, RT);
  const te = (await call('POST', 'login/student', { session_code: RUN, student_code: RUN + 'E1', pin: '1234' })).body.token;
  const tc = (await call('POST', 'login/student', { session_code: RUN, student_code: RUN + 'C1', pin: '1234' })).body.token;
  r = await call('POST', 'me/stage', { stage: 2 }, te); ok(r.status === 200 && r.body.session.stage === 2, '시연 수업: 학생 화면에서 Read로');

  // 1) 두 번 판정이 다르면 보류
  let n0 = calls.length;
  r = await call('POST', 'me/submit', { item_id: 'RD03', fields: { text: '각 성질을 썼어요 AIDISAGREE' } }, te);
  const c1 = calls.slice(n0);
  ok(r.status === 200 && c1.length === 2, 'AI 판정 2회 호출', c1.length);
  const b0 = c1[0] && c1[0].body;
  ok(b0 && b0.model === 'claude-sonnet-5-5' && b0.output_config && b0.output_config.effort === 'medium' && b0.output_config.format.type === 'json_schema' && b0.output_config.format.schema.properties.state.enum.length === 9, '요청 형식: 모델·effort·JSON 스키마(9개 상태)', b0 && { model: b0.model, oc: b0.output_config && Object.keys(b0.output_config) });
  ok(c1.every(function (c) { return c.key === 'test-key' && c.prompt.indexOf(RUN) < 0 && c.prompt.indexOf('1234') < 0; }), '학생 코드·PIN은 AI로 보내지 않음');
  ok(c1[0].prompt.indexOf('[비공개 기준]') >= 0 && c1[0].prompt.indexOf('대각은 같고 인접각 합180') >= 0, '프롬프트에 03 원문 기준');
  ok(r.body.messages.length === 1 && /어떤 뜻인지/.test(r.body.messages[0].text), '불일치 → 뜻 확인 질문');
  let ev = (await sql`select data from events where student_code = ${RUN + 'E1'} and item_id = 'RD03' and event_type = 'FIRST_SUBMIT'`)[0].data;
  ok(ev.judge_source === 'hold' && ev.judge_agreement === false && ev.needs_review === true && ev.student_state === 'AMBIGUOUS', '기록: 보류·검토 필요', ev);
  ok(ev.extra.ai_model === 'claude-sonnet-5-5' && ev.extra.ai.length === 2 && ev.prompt_version === 'judge-0.2/bank-0.2-draft/claude-sonnet-5-5', '기록: 모델·AI 근거·prompt_version', ev.prompt_version);

  // 2) 두 번 일치
  r = await call('POST', 'me/submit', { item_id: 'RD03', fields: { text: '마주 보는 각은 같다 AIAGREE' } }, te);
  ev = (await sql`select data from events where student_code = ${RUN + 'E1'} and item_id = 'RD03' and event_type = 'RESUBMIT' order by seq desc limit 1`)[0].data;
  ok(ev.judge_source === 'ai(2회 일치)' && ev.student_state === 'PARTIAL' && ev.judge_agreement === true, 'AI 2회 일치 → AI 판정 사용', ev.judge_source);

  // 3) 규칙이 확정하면 AI를 부르지 않음
  n0 = calls.length;
  r = await call('POST', 'me/submit', { item_id: 'RD01', fields: { angB: '68', angC: '68', angD: '68' } }, te);
  ok(calls.length === n0, '규칙이 확정한 답은 AI 호출 없음');

  // 4) 통제집단은 AI 없음
  await call('POST', 'me/stage', { stage: 2 }, te);
  n0 = calls.length;
  r = await call('POST', 'me/submit', { item_id: 'RD03', fields: { text: '각 성질을 썼어요 AIDISAGREE' } }, tc);
  ok(r.status === 200 && calls.length === n0 && r.body.messages.length === 0, '통제집단 AI 호출 0회');

  // 5) AI 실패 → 규칙 판정 + 검토 필요
  r = await call('POST', 'me/submit', { item_id: 'RD02', fields: { OC: '3', OD: '4.5', work: '그냥 AIFAIL' } }, te);
  ev = (await sql`select data from events where student_code = ${RUN + 'E1'} and item_id = 'RD02' and event_type = 'FIRST_SUBMIT'`)[0].data;
  ok(r.status === 200 && ev.judge_source === 'rule(ai_unavailable)' && ev.needs_review === true && ev.extra.ai_error === 'api_error', 'AI 오류 → 규칙 판정·검토 필요·오류 기록', { s: ev.judge_source, e: ev.extra.ai_error });
  const t0 = Date.now();
  r = await call('POST', 'me/submit', { item_id: 'RD02', fields: { OC: '3', OD: '4.5', work: '그냥 AILIMIT' } }, te);
  ev = (await sql`select data from events where student_code = ${RUN + 'E1'} and item_id = 'RD02' and event_type = 'RESUBMIT' order by seq desc limit 1`)[0].data;
  ok(r.status === 200 && ev.extra.ai_error === 'rate_limited' && Date.now() - t0 < 15000, '요청 한도(429) → 규칙 판정으로 계속', ev.extra.ai_error);

  // 6) 문장 다듬기: 정답 노출이면 버리고 은행 문장
  r = await call('POST', 'admin/session/update', { session: RUN, key: 'aiPhrase', value: true }, RT);
  r = await call('POST', 'me/submit', { item_id: 'RF03', fields: { use: 'accept', judgment: 'x=10 AI가 맞아요 LEAKPHRASE', final: '10' } }, te);
  ok(r.status === 409, 'Reflect 열리기 전 제출 거부');
  await call('POST', 'me/stage', { stage: 3 }, te);
  r = await call('POST', 'me/submit', { item_id: 'RF03', fields: { use: 'accept', judgment: 'x=10 AI가 맞아요 LEAKPHRASE', final: '10' } }, te);
  const sup = (await sql`select data from events where student_code = ${RUN + 'E1'} and item_id = 'RF03' and event_type = 'SUPPORT_SENT'`)[0].data;
  ok(r.status === 200 && sup.error_flag === true && sup.extra.reason && r.body.messages[0].text.indexOf('112') < 0, '다듬은 문장에 새 숫자 → 차단·은행 문장 대체', { flag: sup.error_flag, extra: sup.extra, text: r.body.messages[0].text });
  r = await call('POST', 'me/submit', { item_id: 'RF01', fields: { use: 'accept', judgment: 'AI 말이 맞는 것 같아요' } }, te);
  const sup2 = (await sql`select data from events where student_code = ${RUN + 'E1'} and item_id = 'RF01' and event_type = 'SUPPORT_SENT'`)[0].data;
  ok(sup2.error_flag === false && sup2.extra.status === 'used' && sup2.support_text === r.body.messages[0].text && sup2.extra.template, '깨끗한 다듬기 문장은 사용·원문 함께 기록', sup2.extra);

  // 7) 연구자 AI 연결 시험
  r = await call('POST', 'admin/ai-test', undefined, RT);
  ok(r.status === 200 && r.body.results.length === 2 && r.body.results[0].state === 'CLEAR_INDEPENDENT', '연구자 화면 AI 연결 시험', r.body);
  r = await call('GET', 'admin/status', undefined, RT);
  ok(r.body.ai.configured === true && r.body.ai.model === 'claude-sonnet-5-5', '운영 점검: AI 연결 표시');

  console.log(pass + ' 통과, ' + fail + ' 실패');
  fails.forEach(function (f) { console.log('FAIL ' + f); });
  mock.close(); await sql.end(); process.exit(fail ? 1 : 0);
})().catch(async function (e) { console.error(e); mock.close(); await sql.end(); process.exit(2); });
