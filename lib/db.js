/* Postgres 연결 (Supabase 연결 문자열 → Transaction pooler, 포트 6543 권장) */
'use strict';
const postgres = require('postgres');
const { httpError } = require('./util');

let sql = null;
function db() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw httpError(500, '서버 설정이 끝나지 않았어요(DATABASE_URL).', 'not_configured');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /host=\//.test(url);
  sql = postgres(url, {
    prepare: false,               // Supabase transaction pooler와 함께 쓰기 위해
    ssl: local ? false : 'require',
    max: Number(process.env.DB_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null },
    onnotice: function () { }
  });
  return sql;
}
async function close() { if (sql) { const s = sql; sql = null; await s.end({ timeout: 2 }); } }

module.exports = { db, close };
