/* Postgres 연결. Supabase(Transaction pooler, 포트 6543)와 Neon(Vercel Storage가 넣어 주는 DATABASE_URL) 모두 쓸 수 있다. */
'use strict';
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const { httpError } = require('./util');

let sql = null;
function db() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw httpError(500, '서버 설정이 끝나지 않았어요(DATABASE_URL).', 'not_configured');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /host=\//.test(url);
  sql = postgres(url, {
    prepare: false,               // 연결 풀러(Supabase·Neon pooled)와 함께 쓰기 위해
    ssl: local ? false : 'require',
    max: Number(process.env.DB_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 15,          // Neon은 쉬다가 깨어날 때 1초 안팎 걸릴 수 있다
    transform: { undefined: null },
    onnotice: function () { }
  });
  return sql;
}

/* 빈 데이터베이스면 db/schema.sql을 한 번 실행해 표를 만든다.
   schema.sql의 마지막 문장(heartbeat 표의 RLS)이 적용돼 있으면 이미 끝난 것으로 본다.
   여러 서버 인스턴스가 동시에 깨어나도 advisory lock으로 한 번만 실행된다. */
const SCHEMA_LOCK = 74610419;
let schemaReady = null;
function schemaDone(s) {
  return s`select coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.heartbeat')), false) as ok`
    .then(function (r) { return r[0].ok === true; });
}
function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async function () {
    const s = db();
    if (await schemaDone(s)) return 'ready';
    const text = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    let created = false;
    await s.begin(async function (tx) {
      await tx`select pg_advisory_xact_lock(${SCHEMA_LOCK})`;
      if (await schemaDone(tx)) return;
      await tx.unsafe(text).simple();
      created = true;
    });
    if (created) console.log('[db] 빈 데이터베이스에 표를 만들었어요 (db/schema.sql)');
    return created ? 'created' : 'ready';
  })().catch(function (e) { schemaReady = null; throw e; });
  return schemaReady;
}

async function close() { schemaReady = null; if (sql) { const s = sql; sql = null; await s.end({ timeout: 2 }); } }

module.exports = { db, ensureSchema, close };
