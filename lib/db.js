/* Postgres 연결. Supabase(Transaction pooler, 포트 6543)와 Neon(Vercel Storage가 넣어 주는 DATABASE_URL) 모두 쓸 수 있다. */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
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

/* 데이터베이스 표 준비. 빈 데이터베이스이거나 db/schema.sql 내용이 바뀌었으면(판 번호가 다르면)
   schema.sql을 한 번 실행한다. 파일은 여러 번 실행해도 안전하게 쓰여 있어(if not exists 등) 기존 기록은 그대로 둔다.
   여러 서버 인스턴스가 동시에 깨어나도 advisory lock으로 한 번만 실행된다. */
const SCHEMA_LOCK = 74610419;
let schemaReady = null, schemaText = null, schemaVersion = null;
function loadSchema() {
  if (!schemaText) {
    schemaText = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    schemaVersion = crypto.createHash('sha256').update(schemaText).digest('hex').slice(0, 16);
  }
}
async function currentVersion(s) {
  // to_regclass는 '없음'을 연결별 캐시에 남겨, 다른 인스턴스가 방금 만든 표를 잠금 뒤에도 못 볼 수 있다 → pg_class를 직접 읽는다.
  const t = await s`select exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'schema_meta') as ok`;
  if (!t[0].ok) return null;
  const r = await s`select version from schema_meta where id = 1`;
  return r.length ? r[0].version : null;
}
function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async function () {
    const s = db();
    loadSchema();
    if (await currentVersion(s) === schemaVersion) return 'ready';
    let applied = false;
    await s.begin(async function (tx) {
      await tx`select pg_advisory_xact_lock(${SCHEMA_LOCK})`;
      if (await currentVersion(tx) === schemaVersion) return;
      await tx.unsafe(schemaText).simple();
      await tx`insert into schema_meta (id, version, applied_at) values (1, ${schemaVersion}, now())
        on conflict (id) do update set version = excluded.version, applied_at = now()`;
      applied = true;
    });
    if (applied) console.log('[db] 데이터베이스 표를 준비했어요 (db/schema.sql ' + schemaVersion + ')');
    return applied ? 'created' : 'ready';
  })().catch(function (e) { schemaReady = null; throw e; });
  return schemaReady;
}

async function close() { schemaReady = null; if (sql) { const s = sql; sql = null; await s.end({ timeout: 2 }); } }

module.exports = { db, ensureSchema, close };
