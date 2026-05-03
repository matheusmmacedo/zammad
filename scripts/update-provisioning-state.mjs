// Atualiza provisioning_state da org Glocal pra refletir realidade:
// - seed_keys: pending → done (13 keys ativas)
// - slack_channel: pending → done (#klaos-agents + bot token configurado)
// webhooks_github fica pending (workaround via runner trigger manual continua válido)

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, '..', '..', 'devpilot', '.env.local');

let SUPABASE_URL, SUPABASE_KEY;
const env = readFileSync(ENV_PATH, 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^(\w+)=(.+)$/);
  if (!m) continue;
  if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL') SUPABASE_URL = m[2].trim().replace(/^["']|["']$/g, '');
  if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_KEY = m[2].trim().replace(/^["']|["']$/g, '');
}

async function pgrst(path, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Accept-Profile': 'devpilot',
      'Content-Profile': 'devpilot',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`pgrst ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  if (r.status === 204) return null;
  return r.json();
}

const orgs = await pgrst('organizations?select=id,provisioning_state&slug=eq.glocal-my-business');
if (!orgs?.length) {
  console.error('org não encontrada');
  process.exit(1);
}
const org = orgs[0];
const ps = org.provisioning_state || { steps: {} };
const now = new Date().toISOString();

const UPDATES = {
  seed_keys: { status: 'done', notes: '13 keys ativas (claude_oauth ×2, openai, github, sentry, slack, op, zammad, supabase_access, resend, perplexity, evolution, unipile)', ts: now },
  slack_channel: { status: 'done', notes: '#klaos-agents + SLACK_BOT_TOKEN configurado em runner', ts: now },
};

for (const [step, patch] of Object.entries(UPDATES)) {
  const before = ps.steps?.[step];
  ps.steps = ps.steps || {};
  ps.steps[step] = { ...before, ...patch };
  console.log(`  ✅ ${step}: ${before?.status || '(novo)'} → ${patch.status}`);
}

await pgrst(`organizations?id=eq.${org.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ provisioning_state: ps }),
});

console.log('\n[provisioning] Glocal atualizado.');
const remaining = Object.entries(ps.steps).filter(([, v]) => v.status === 'pending');
console.log(`[provisioning] ${remaining.length} steps ainda pending:`);
for (const [k, v] of remaining) {
  console.log(`  - ${k}: ${v.notes || ''}`);
}
