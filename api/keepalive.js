/* 하루 한 번(vercel.json crons) 데이터베이스에 기록을 남긴다. 무료 Supabase는 1주일 무활동이면 일시정지되므로 이를 막고, Neon에서는 연결 점검 역할을 한다. */
'use strict';
const { db, ensureSchema } = require('../lib/db');
const { send } = require('../lib/util');

module.exports = async function keepalive(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers['authorization'] || '';
  if (secret && auth !== 'Bearer ' + secret) { send(res, 401, { error: 'unauthorized' }); return; }
  try {
    await ensureSchema();
    const sql = db();
    const [r] = await sql`insert into heartbeat (id, at, note) values (1, now(), 'cron') on conflict (id) do update set at = now(), note = 'cron' returning at`;
    send(res, 200, { ok: true, at: r.at });
  } catch (e) {
    console.error('[keepalive]', e && e.message);
    send(res, 500, { ok: false });
  }
};
