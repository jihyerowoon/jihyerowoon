/* 빈 데이터베이스 자동 표 생성 시험. 사용: AUTO_DB_URL=postgres://.../빈DB node tests/autoschema.test.js
   두 프로세스가 동시에 깨어나는 상황(서버 인스턴스 2개)을 흉내 내고, 결과 표·트리거·RLS를 확인한다. */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const postgres = require('postgres');

const URL_ = process.env.AUTO_DB_URL;
if (!URL_) { console.error('AUTO_DB_URL 필요'); process.exit(2); }
let pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) { pass++; } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } }

function child() {
  return new Promise(function (resolve) {
    const code = "const D=require(" + JSON.stringify(path.join(__dirname, '..', 'lib', 'db')) + ");" +
      "D.ensureSchema().then(function(r){console.log(r);return D.close();}).catch(function(e){console.log('ERR '+e.message);process.exitCode=1;});";
    const p = spawn(process.execPath, ['-e', code], { env: Object.assign({}, process.env, { DATABASE_URL: URL_ }) });
    let out = '';
    p.stdout.on('data', function (d) { out += d; });
    p.stderr.on('data', function (d) { out += d; });
    p.on('close', function (c) { resolve({ code: c, out: out.trim() }); });
  });
}

(async function () {
  const sql = postgres(URL_, { max: 1, onnotice: function () { } });
  const before = await sql`select count(*)::int as n from pg_tables where schemaname = 'public'`;
  ok(before[0].n === 0, '시작 전 빈 DB', before[0].n);

  const runs = await Promise.all([child(), child(), child()]);
  ok(runs.every(function (r) { return r.code === 0; }), '동시 3개 모두 성공', runs);
  const results = runs.map(function (r) { return r.out.split('\n').pop(); }).sort();
  ok(results.filter(function (x) { return x === 'created'; }).length === 1, '표 생성은 정확히 한 번', results);
  ok(results.filter(function (x) { return x === 'ready'; }).length === 2, '나머지는 이미 준비됨', results);

  const tables = (await sql`select tablename from pg_tables where schemaname = 'public' order by 1`).map(function (r) { return r.tablename; });
  ['auth_failures', 'events', 'heartbeat', 'help_requests', 'item_states', 'messages', 'participants', 'sessions', 'students'].forEach(function (t) {
    ok(tables.indexOf(t) >= 0, '표 ' + t, tables);
  });
  const rls = await sql`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
  ok(rls[0].n === 0, '모든 표 RLS 켜짐', rls[0].n);

  await sql`insert into events (event_id, session_id, student_code, event_type, data) values ('auto-1', null, null, 'TEST', '{}'::jsonb)`.catch(function (e) { ok(false, '기록 추가', e.message); });
  let blocked = false;
  try { await sql`update events set event_type = 'X' where event_id = 'auto-1'`; } catch (e) { blocked = /추가만/.test(e.message); }
  ok(blocked, '기록 수정 거부 트리거');

  const again = await child();
  ok(again.code === 0 && /ready$/.test(again.out), '다시 실행하면 그대로', again);

  await sql.end({ timeout: 2 });
  console.log(pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
