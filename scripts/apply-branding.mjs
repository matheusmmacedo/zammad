#!/usr/bin/env node
// Apply KLaOS branding settings directly into the Zammad Postgres.
// Reads asset files from packages/src/klaos-branding/ and writes into
// the `settings` table (and Store/StoreFile for the logo).
//
// Usage: node scripts/apply-branding.mjs --host HOST --port PORT --pass PASS

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const client = new Client({ host, port, user, password, database, ssl: false });
await client.connect();
console.log(`connected to ${host}:${port}/${database} as ${user}`);

// --- Plain settings via state_current JSON ---
const plainSettings = {
  product_name: 'KLaOS Helpdesk',
  organization: 'KLaOS',
};

for (const [name, value] of Object.entries(plainSettings)) {
  const jsonValue = JSON.stringify({ value });
  const res = await client.query(
    `UPDATE settings SET state_current = $1 WHERE name = $2`,
    [jsonValue, name],
  );
  console.log(`  ${name} = ${JSON.stringify(value)} (${res.rowCount} row)`);
}

// --- Product logo: store SVG via Store/StoreFile/StoreProviderDb ---
const logoPath = new URL('../packages/src/klaos-branding/assets/logo-klaos.svg', import.meta.url);
const logoSvg = readFileSync(logoPath);
const logoSha = createHash('sha256').update(logoSvg).digest('hex');
const now = new Date();

// Ensure store_object exists
let storeObject = await client.query(`SELECT id FROM store_objects WHERE name = 'System::Assets::ProductLogo'`);
if (storeObject.rowCount === 0) {
  await client.query(
    `INSERT INTO store_objects (name, created_at, updated_at) VALUES ('System::Assets::ProductLogo', $1, $1)`,
    [now],
  );
  storeObject = await client.query(`SELECT id FROM store_objects WHERE name = 'System::Assets::ProductLogo'`);
}
const storeObjectId = storeObject.rows[0].id;

// Delete previous stores pointing to this object
await client.query(`DELETE FROM stores WHERE store_object_id = $1`, [storeObjectId]);

// Upsert store_provider_db (holds the actual bytes keyed by sha)
const existing = await client.query(`SELECT 1 FROM store_provider_dbs WHERE sha = $1`, [logoSha]);
if (existing.rowCount === 0) {
  await client.query(
    `INSERT INTO store_provider_dbs (sha, data, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
    [logoSha, logoSvg, now],
  );
}

// Upsert store_files (metadata, dedup by sha)
let storeFile = await client.query(`SELECT id FROM store_files WHERE sha = $1`, [logoSha]);
if (storeFile.rowCount === 0) {
  storeFile = await client.query(
    `INSERT INTO store_files (sha, provider, created_at, updated_at) VALUES ($1, 'DB', $2, $2) RETURNING id`,
    [logoSha, now],
  );
}
const storeFileId = storeFile.rows[0].id;

// Insert Store records: raw (o_id=1) and resized (o_id=2). SVG scales so reuse same file.
for (const oId of ['1', '2']) {
  await client.query(
    `INSERT INTO stores (store_object_id, store_file_id, o_id, preferences, filename, size, created_at, updated_at, created_by_id)
     VALUES ($1, $2, $3, $4, 'logo-klaos.svg', $5, $6, $6, 1)`,
    [storeObjectId, storeFileId, oId, JSON.stringify({ 'Content-Type': 'image/svg+xml' }), String(logoSvg.length), now],
  );
}

// Update product_logo setting to a timestamp (Zammad uses this to bust cache)
const ts = Math.floor(Date.now() / 1000).toString();
await client.query(
  `UPDATE settings SET state_current = $1 WHERE name = 'product_logo'`,
  [JSON.stringify({ value: ts })],
);
console.log(`  product_logo = ${ts} (SVG ${logoSvg.length} bytes, sha ${logoSha.slice(0, 12)}…)`);

console.log('\nDone. Restart zammad-railsserver to invalidate the setting cache.');
await client.end();
