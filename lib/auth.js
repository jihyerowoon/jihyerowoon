/* 로그인 토큰(HMAC 서명)과 PIN 해시 */
'use strict';
const crypto = require('crypto');
const { httpError } = require('./util');

function secret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw httpError(500, '서버 설정이 끝나지 않았어요(APP_SECRET 16자 이상).', 'not_configured');
  return s;
}
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }

function sign(payload, ttlSec) {
  const body = Object.assign({}, payload, { iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec });
  const p = b64u(JSON.stringify(body));
  const mac = b64u(crypto.createHmac('sha256', secret()).update(p).digest());
  return p + '.' + mac;
}
function verify(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const mac = b64u(crypto.createHmac('sha256', secret()).update(parts[0]).digest());
  if (!safeEq(mac, parts[1])) return null;
  let body; try { body = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) { crypto.timingSafeEqual(x, x); return false; }
  return crypto.timingSafeEqual(x, y);
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pin), salt, 32);
  return 's1$' + salt.toString('base64') + '$' + h.toString('base64');
}
function checkPin(pin, stored) {
  if (!stored || stored.indexOf('s1$') !== 0) return false;
  const p = stored.split('$');
  const h = crypto.scryptSync(String(pin), Buffer.from(p[1], 'base64'), 32);
  return safeEq(h.toString('base64'), p[2]);
}
function newPin(len) { let s = ''; for (let i = 0; i < (len || 4); i++) s += String(crypto.randomInt(0, 10)); return s; }

function bearer(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
function requireRole(req, roles) {
  const t = verify(bearer(req));
  if (!t) throw httpError(401, '다시 로그인해 주세요.', 'unauthorized');
  if (roles.indexOf(t.role) < 0) throw httpError(403, '이 화면을 쓸 권한이 없어요.', 'forbidden');
  return t;
}

module.exports = { sign, verify, safeEq, hashPin, checkPin, newPin, bearer, requireRole };
