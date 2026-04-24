#!/usr/bin/env node
// Install .zpm packages into a live Zammad by:
//   1) creating a short-lived API token directly in the `tokens` table
//      (user_id=1 is always the first admin)
//   2) uploading each .zpm to /api/v1/packages with that token
//   3) deleting the token
//
// Also optionally kicks off password_reset emails for selected users.
//
// Usage:
//   node scripts/install-packages.mjs \
//     --host <pgHost> --port <pgPort> --pass <pgPass> \
//     --zammad https://helpdesk.klaos.ai \
//     [--packages packages/build/klaos-branding-0.1.0.zpm,…] \
//     [--invite 3,4,5,6,7,8]

import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const pgClient = new Client({
  host: args.host, port: Number(args.port),
  user: args.user ?? 'zammad', password: args.pass,
  database: args.db ?? 'zammad_production', ssl: false,
});
await pgClient.connect();
console.log(`pg connected to ${args.host}:${args.port}`);

// 1) Find the first Admin-role user, create an API token for them.
// user_id=1 is Zammad's System user (inactive); first real admin is id=3+.
const adminRow = await pgClient.query(
  `SELECT u.id FROM users u
   JOIN roles_users ru ON ru.user_id = u.id
   JOIN roles r ON ru.role_id = r.id
   WHERE u.active = true AND r.name = 'Admin'
   ORDER BY u.id LIMIT 1`,
);
if (adminRow.rowCount === 0) throw new Error('no active Admin user found');
const adminUserId = adminRow.rows[0].id;
console.log(`using admin user_id=${adminUserId}`);

const tokenString = randomBytes(32).toString('hex');
const insToken = await pgClient.query(
  `INSERT INTO tokens (action, persistent, user_id, name, token, preferences, created_at, updated_at)
   VALUES ('api', true, $1, 'klaos-automation (temporary)', $2, $3, NOW(), NOW())
   RETURNING id`,
  [adminUserId, tokenString, JSON.stringify({ permission: ['admin', 'admin.package', 'admin.user', 'ticket.agent'] })],
);
const tokenId = insToken.rows[0].id;
console.log(`token #${tokenId} created (user_id=1, action=api)`);

const authHeader = `Token token=${tokenString}`;
const zammad = args.zammad || 'https://helpdesk.klaos.ai';

try {
  // 2) Upload packages (skipped if --packages=skip)
  const pkgs = args.packages === 'skip' ? []
    : (args.packages
        ? args.packages.split(',').map(s => s.trim()).filter(Boolean)
        : readdirSync('packages/build').filter(f => f.endsWith('.zpm')).map(f => `packages/build/${f}`));

  for (const p of pkgs) {
    const bytes = readFileSync(p);
    const fd = new FormData();
    fd.append('file_upload', new Blob([bytes], { type: 'application/octet-stream' }), p.split(/[\\/]/).pop());

    console.log(`uploading ${p} (${bytes.length} bytes) to ${zammad}/api/v1/packages`);
    const res = await fetch(`${zammad}/api/v1/packages`, {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: fd,
    });
    const body = await res.text();
    console.log(`  -> HTTP ${res.status} ${body.substring(0, 300)}`);
  }

  // 3) Optional: send password_reset for selected user ids (re-invites)
  if (args.invite) {
    const ids = args.invite.split(',').map(s => Number(s.trim())).filter(Boolean);
    for (const id of ids) {
      const u = await pgClient.query(`SELECT email FROM users WHERE id = $1`, [id]);
      const email = u.rows[0]?.email;
      if (!email) { console.log(`  skip user#${id}: not found`); continue; }
      const res = await fetch(`${zammad}/api/v1/users/password_reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ username: email }),
      });
      const body = await res.text();
      console.log(`  invite user#${id} <${email}> -> HTTP ${res.status} ${body.substring(0, 200)}`);
    }
  }
} finally {
  // 4) Clean up the temp token
  await pgClient.query(`DELETE FROM tokens WHERE id = $1`, [tokenId]);
  console.log(`token #${tokenId} deleted`);
  await pgClient.end();
}
