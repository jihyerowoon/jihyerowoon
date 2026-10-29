/* 모든 /api/v1/* 요청을 받는 하나의 서버 함수 (vercel.json의 rewrite로 연결) */
'use strict';
const C = require('../lib/content');
const A = require('../lib/auth');
const S = require('../lib/student');
const T = require('../lib/staff');
const D = require('../lib/db');
const Room = require('../lib/classroom');
const Assets = require('../lib/assets');
const { HttpError, readBody, send, sendText } = require('../lib/util');

/* 브라우저로 보내는 공개분. 정답(KEYS)·정답 기준(RUBRIC)·발문 은행(BANK)·AI 설명의 정오 판단(FIXED_AI.type/ok)은 보내지 않는다 */
function publicContent() {
  const fixed = {};
  Object.keys(C.FIXED_AI).forEach(function (k) { fixed[k] = { text: C.FIXED_AI[k].text }; });
  return {
    versions: C.VERSIONS, stages: C.STAGES, lessons: C.LESSONS, problems: C.PROBLEMS, figs: C.FIGS, items: C.ITEMS, fixed_ai: fixed,
    verdict_choices: C.VERDICT_CHOICES, figure: C.FIGURE, materials: C.MATERIALS
  };
}

const STUDENT = ['student'], STAFF = ['teacher', 'researcher'], RESEARCHER = ['researcher'];
const routes = {
  'POST staff/new-lesson': { roles: STAFF, body: true, fn: async function(ctx){return Room.newLesson(ctx.tok,ctx.body);} },
  'POST staff/ready': { roles: STAFF, body: true, fn: async function(ctx){return Room.ready(ctx.tok,ctx.body);} },
  'POST login/staff/refresh': { roles: STAFF, noDb: true, fn: async function(ctx){return T.refreshLogin(ctx.tok);} },
  'POST staff/new-demo': { roles: STAFF, body: true, fn: async function(ctx){return Room.newDemo(ctx.tok,ctx.body);} },
  'POST me/reflection-draft': { roles: STUDENT, body: true, fn: async function(ctx){return S.reflectionDraft(ctx.tok,ctx.body);} },
  'GET admin/classes': { roles: RESEARCHER, fn: async function(){return Room.classes();} },
  'GET admin/lesson-assets': { roles: RESEARCHER, fn: async function(){return Assets.manifest();} },
  'POST admin/lesson-asset': { roles: RESEARCHER, body: true, fn: async function(ctx){return Assets.upload(ctx.tok,ctx.body);} },
  'GET me/lesson-asset': { roles: STUDENT, fn: async function(ctx){return Assets.student(ctx.tok,ctx.query);} },
  'POST admin/class': { roles: RESEARCHER, body: true, fn: async function(ctx){return Room.saveClass(ctx.tok,ctx.body);} },
  'POST admin/fixed-codes': { roles: RESEARCHER, body: true, fn: async function(ctx){return Room.setupFixedCodes(ctx.tok);} },
  'POST admin/class-roster': { roles: RESEARCHER, body: true, fn: async function(ctx){return Room.roster(ctx.tok,ctx.body);} },
  'POST staff/send-batch': { roles: STAFF, body: true, fn: async function(ctx){return Room.batchSend(ctx.tok,ctx.body);} },
  'POST staff/clock': { roles: STAFF, body: true, fn: async function(ctx){return Room.clock(ctx.tok,ctx.body);} },
  'POST staff/announce': { roles: STAFF, body: true, fn: async function(ctx){return Room.announce(ctx.tok,ctx.body);} },
  'GET me/supplements': { roles: STUDENT, fn: async function(ctx){return S.supplements(ctx.tok);} },
  'POST me/supplement': { roles: STUDENT, body: true, fn: async function(ctx){return S.supplement(ctx.tok,ctx.body);} },

  'GET health': { noDb: true, fn: async function () { return { ok: true, version: C.VERSIONS.app }; } },
  'GET content': { noDb: true, fn: async function () { return publicContent(); } },
  'POST login/student': { body: true, fn: async function (ctx) { return S.login(ctx.body); } },
  'POST login/staff': { body: true, fn: async function (ctx) { return T.login(ctx.body, ctx.req); } },

  'GET me': { roles: STUDENT, fn: async function (ctx) { return S.me(ctx.tok); } },
  'GET me/sync': { roles: STUDENT, fn: async function (ctx) { return S.sync(ctx.tok, ctx.query); } },
  'POST me/focus': { roles: STUDENT, body: true, fn: async function(ctx){return S.focus(ctx.tok,ctx.body);} },
  'POST me/draft': { roles: STUDENT, body: true, fn: async function (ctx) { return S.saveDraft(ctx.tok, ctx.body); } },
  'POST me/submit': { roles: STUDENT, body: true, fn: async function (ctx) { return S.submit(ctx.tok, ctx.body); } },
  'POST me/help': { roles: STUDENT, body: true, fn: async function (ctx) { return S.help(ctx.tok, ctx.body); } },
  'GET me/review-feedback': { roles: STUDENT, fn: async function (ctx) { return S.reviewFeedback(ctx.tok); } },
  'POST me/review-reflection': { roles: STUDENT, body: true, fn: async function (ctx) { return S.reviewReflect(ctx.tok, ctx.body); } },
  'POST me/event': { roles: STUDENT, body: true, fn: async function (ctx) { return S.clientEvent(ctx.tok, ctx.body); } },
  'POST me/stage': { roles: STUDENT, body: true, fn: async function (ctx) { return S.demoStage(ctx.tok, ctx.body); } },

  'GET staff/sessions': { roles: STAFF, fn: async function (ctx) { return Room.sessions(ctx.tok); } },
  'GET staff/content': { roles: STAFF, fn: async function () { return T.staffContent(); } },
  'GET staff/overview': { roles: STAFF, fn: async function (ctx) { return Room.overview(ctx.tok, ctx.query); } },
  'GET staff/student': { roles: STAFF, fn: async function (ctx) { return T.studentDetail(ctx.query); } },
  'POST staff/stage': { roles: STAFF, body: true, fn: async function (ctx) { return T.stage(ctx.tok, ctx.body); } },
  'POST staff/send': { roles: STAFF, body: true, fn: async function (ctx) { return T.send(ctx.tok, ctx.body); } },
  'POST staff/oral-note': { roles: STAFF, body: true, fn: async function(ctx){await Room.access(ctx.tok,ctx.body.session);return T.oralNote(ctx.tok,ctx.body);} },

  'POST admin/session': { roles: RESEARCHER, body: true, fn: async function (ctx) { return T.createSession(ctx.tok, ctx.body); } },
  'POST admin/session/update': { roles: RESEARCHER, body: true, fn: async function (ctx) { return T.updateSession(ctx.tok, ctx.body); } },
  'POST admin/roster': { roles: RESEARCHER, body: true, fn: async function (ctx) { return T.roster(ctx.tok, ctx.body); } },
  'GET admin/students': { roles: RESEARCHER, fn: async function () { return T.students(); } },
  'POST admin/student': { roles: RESEARCHER, body: true, fn: async function (ctx) { return T.studentUpdate(ctx.tok, ctx.body); } },
  'GET admin/events': { roles: RESEARCHER, fn: async function (ctx) { return { events: await T.events(ctx.query) }; } },
  'GET admin/export': { roles: RESEARCHER, file: true, fn: async function (ctx) { return T.exportData(ctx.query); } },
  'GET admin/backup': { roles: RESEARCHER, file: true, fn: async function () { return T.backup(); } },
  'GET admin/fidelity': { roles: RESEARCHER, fn: async function (ctx) { return T.fidelity(ctx.query); } },
  'POST admin/review': { roles: RESEARCHER, body: true, fn: async function (ctx) { return T.review(ctx.tok, ctx.body); } },
  'GET admin/bank': { roles: RESEARCHER, fn: async function () { return T.bankAll(); } },
  'GET admin/status': { roles: RESEARCHER, fn: async function () { return T.status(); } },
  'POST admin/ai-test': { roles: RESEARCHER, fn: async function () { return T.aiTest(); } }
};

function parseQuery(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const u = new URL(req.url, 'http://x');
  const q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
  return q;
}

module.exports = async function handler(req, res) {
  const query = parseQuery(req);
  let p = String(query.p || '').replace(/^\/+|\/+$/g, '');
  if (Array.isArray(query.p)) p = query.p.join('/');
  const route = routes[req.method + ' ' + p];
  try {
    if (!route) { send(res, req.method === 'OPTIONS' ? 204 : 404, { error: '없는 주소예요.', code: 'not_found' }); return; }
    const ctx = { query: query, tok: null, body: null, req: req };
    if (route.roles) ctx.tok = A.requireRole(req, route.roles);
    if (!route.noDb) await D.ensureSchema();
    if (route.body) ctx.body = await readBody(req);
    if (route.roles && route.roles.includes('teacher') && ctx.tok && (ctx.body && ctx.body.session || ctx.query.session)) await Room.access(ctx.tok,ctx.body && ctx.body.session || ctx.query.session);
    const out = await route.fn(ctx);
    if (route.file) { sendText(res, 200, out.text, out.type, out.filename); return; }
    send(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) { send(res, e.status, { error: e.message, code: e.code, extra: e.extra }); return; }
    console.error('[api]', req.method, p, e && e.stack || e);
    const msg = e && /connect|ECONN|timeout|terminat/i.test(String(e.message)) ? '데이터베이스에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.' : '서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';
    send(res, 500, { error: msg, code: 'server_error' });
  }
};
module.exports.routes = routes;
