#!/usr/bin/env node
// Diagnostic — checks if invite emails actually went out of the Zammad
// helpdesk. Reads through a Railway TCP proxy. One-off.
//
// Usage: node scripts/check-invites.mjs --host HOST --port PORT --pass PASS

import { Client } from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const c = new Client({
  host: args.host, port: Number(args.port), user: args.user ?? 'zammad',
  password: args.pass, database: args.db ?? 'zammad_production', ssl: false,
});
await c.connect();

console.log('=== RECENT USERS (id > 2) ===');
const u = await c.query(
  `SELECT id, login, email, verified, created_at
     FROM users WHERE id > 2 ORDER BY created_at DESC LIMIT 10`,
);
for (const r of u.rows) console.log(`  #${r.id} ${r.email} verified=${r.verified} created=${r.created_at.toISOString()}`);

console.log('\n=== TOKENS (invite tokens should appear here) ===');
const t = await c.query(
  `SELECT id, action, user_id, expires_at, created_at
     FROM tokens ORDER BY created_at DESC LIMIT 10`,
);
if (t.rows.length === 0) console.log('  (empty)');
for (const r of t.rows) console.log(`  #${r.id} action=${r.action} user=${r.user_id} created=${r.created_at.toISOString()} exp=${r.expires_at?.toISOString()}`);

console.log('\n=== FAILED EMAILS ===');
const fe = await c.query(`SELECT id, subject, created_at FROM failed_emails ORDER BY created_at DESC LIMIT 10`);
if (fe.rows.length === 0) console.log('  (empty — no failures in the failed queue)');
for (const r of fe.rows) console.log(`  #${r.id} "${r.subject}" created=${r.created_at.toISOString()}`);

console.log('\n=== HISTORIES (User creates + email notifications) ===');
const histSql = `
  SELECT h.id, h.o_id, h.value_from, h.value_to, h.created_at, ho.name AS obj, ht.name AS type
    FROM histories h
    JOIN history_objects ho ON h.history_object_id = ho.id
    JOIN history_types ht ON h.history_type_id = ht.id
   WHERE ho.name IN ('User','Email')
      OR ht.name IN ('created','notification','email')
   ORDER BY h.created_at DESC LIMIT 20`;
const h = await c.query(histSql);
for (const r of h.rows) console.log(`  ${r.obj} #${r.o_id} ${r.type} -> ${r.value_to || ''} (${r.created_at.toISOString()})`);

console.log('\n=== SETTINGS (notification / fqdn) ===');
const s = await c.query(`SELECT name, state_current FROM settings WHERE name IN ('notification_sender','fqdn','product_name','system_online_service')`);
for (const r of s.rows) console.log(`  ${r.name} -> ${r.state_current}`);

console.log('\n=== EMAIL CHANNELS ===');
const ch = await c.query(`SELECT id, area, active, options, last_log_out FROM channels ORDER BY id`);
for (const r of ch.rows) {
  const opt = typeof r.options === 'string' ? r.options.substring(0, 200) : JSON.stringify(r.options).substring(0, 200);
  console.log(`  ch#${r.id} area=${r.area} active=${r.active}`);
  console.log(`    options: ${opt}`);
  if (r.last_log_out) console.log(`    last_log_out: ${String(r.last_log_out).substring(0, 300)}`);
}

await c.end();
