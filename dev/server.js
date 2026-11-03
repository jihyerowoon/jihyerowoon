/* 로컬 개발·시험용 서버: Vercel과 같은 경로 규칙(public 정적 파일, /api/v1/* → api/router.js)과 보안 헤더를 흉내 낸다.
 * 사용: .env.local에 DATABASE_URL 등을 적고 `npm run dev` */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(function (l) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
const router = require('../api/router');
const keepalive = require('../api/keepalive');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const pub = path.join(root, vercel.outputDirectory || 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

function applyHeaders(res, urlPath) {
  (vercel.headers || []).forEach(function (h) {
    const re = new RegExp('^' + h.source.replace('(.*)', '.*') + '$');
    if (re.test(urlPath)) h.headers.forEach(function (x) { res.setHeader(x.key, x.value); });
  });
}

const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://localhost');
  applyHeaders(res, u.pathname);
  if (u.pathname.indexOf('/api/v1/') === 0) {
    const q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
    q.p = u.pathname.slice('/api/v1/'.length);
    req.query = q;
    Promise.resolve(router(req, res)).catch(function (e) { console.error(e); res.statusCode = 500; res.end('error'); });
    return;
  }
  if (u.pathname === '/api/keepalive') { Promise.resolve(keepalive(req, res)); return; }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(pub, p));
  if (file.indexOf(pub) !== 0) { res.statusCode = 403; res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
const port = Number(process.env.PORT || 3000);
server.listen(port, function () { console.log('PQ4R MVP dev server http://localhost:' + port); });
