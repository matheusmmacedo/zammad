#!/usr/bin/env node
// One-off helper to apply klaos-translations SQLs against the Zammad Postgres
// over a Railway TCP proxy. Never keep this running — it's a tool script.
//
// Usage (args override env):
//   node scripts/apply-translations.mjs --host HOST --port PORT --pass PASS

import { readFileSync, readdirSync } from 'node:fs';
import { Client } from 'pg';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const host = args.host ?? process.env.PGHOST;
const port = Number(args.port ?? process.env.PGPORT ?? 5432);
const user = args.user ?? process.env.PGUSER ?? 'zammad';
const password = args.pass ?? process.env.PGPASSWORD;
const database = args.db ?? process.env.PGDATABASE ?? 'zammad_production';

if (!host || !password) {
  console.error('ERROR: --host and --pass (or PGHOST and PGPASSWORD env) are required');
  process.exit(1);
}

const sqlDir = new URL('../packages/src/klaos-translations/sql/', import.meta.url);
const files = readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();

const client = new Client({ host, port, user, password, database, ssl: false });
await client.connect();
console.log(`connected to ${host}:${port}/${database} as ${user}`);

let total = 0;
for (const file of files) {
  const sql = readFileSync(new URL(file, sqlDir), 'utf8');
  const stmts = sql.split(/;\s*\r?\n/).map((s) => s.trim()).filter(Boolean);
  let applied = 0;
  let zeroRows = 0;
  for (const stmt of stmts) {
    const res = await client.query(stmt + ';');
    if (res.rowCount === 0) zeroRows++;
    else applied += res.rowCount;
  }
  console.log(`  ${file}: ${stmts.length} stmts | ${applied} rows updated | ${zeroRows} no-op (id drift)`);
  total += applied;
}
console.log(`total rows updated: ${total}`);

await client.end();
