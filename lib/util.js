/* 공통 도구: 오류, 요청 본문, 응답 */
'use strict';

class HttpError extends Error {
  constructor(status, message, code, extra) { super(message); this.status = status; this.code = code || 'error'; this.extra = extra || null; }
}
function httpError(status, message, code, extra) { return new HttpError(status, message, code, extra); }

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return req.body ? JSON.parse(req.body) : {}; } catch (e) { throw httpError(400, '요청 형식이 올바르지 않아요.', 'bad_json'); } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 2 * 1024 * 1024) throw httpError(413, '요청이 너무 커요.', 'too_large'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { throw httpError(400, '요청 형식이 올바르지 않아요.', 'bad_json'); }
}

function send(res, status, obj, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.keys(headers || {}).forEach(function (k) { res.setHeader(k, headers[k]); });
  res.end(JSON.stringify(obj));
}
function sendText(res, status, text, type, filename) {
  res.statusCode = status;
  res.setHeader('Content-Type', type + '; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (filename) res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.end(text);
}

function str(v, max) { v = v == null ? '' : String(v); return max ? v.slice(0, max) : v; }
function nowIso() { return new Date().toISOString(); }
function uid(p) { return (p || '') + Date.now().toString(36) + require('crypto').randomBytes(5).toString('hex'); }

module.exports = { HttpError, httpError, readBody, send, sendText, str, nowIso, uid };
