// Patch cirúrgico: corrige `branch` em devpilot.codebase_environments pra
// alinhar com o fluxo real (klaos-dev/klaos-production pra frontdesk; dev/main
// pra klaos), porque o seed inicial herdou os valores da configuração padrão
// do onboarding (dev=develop, prod=master) que NÃO bate com o gate.mjs.

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

// PATCHES: { codebase_slug: { env_slug: { branch, ... } } }
const PATCHES = {
  frontdesk: {
    dev: { branch: 'klaos-dev' },
    prod: { branch: 'klaos-production' },
  },
};

const codebases = await pgrst(`codebases?select=id,slug&archived_at=is.null`);
const slugToId = Object.fromEntries(codebases.map((c) => [c.slug, c.id]));

let patched = 0, skipped = 0;
for (const [cbSlug, envPatches] of Object.entries(PATCHES)) {
  const cbId = slugToId[cbSlug];
  if (!cbId) {
    console.log(`  ⚠️  ${cbSlug} — codebase não encontrada`);
    continue;
  }
  for (const [envSlug, target] of Object.entries(envPatches)) {
    const cur = await pgrst(`codebase_environments?select=id,branch&codebase_id=eq.${cbId}&slug=eq.${envSlug}`);
    if (!cur?.length) {
      console.log(`  ⚠️  ${cbSlug}/${envSlug} — env não existe`);
      continue;
    }
    const row = cur[0];
    if (row.branch === target.branch) {
      console.log(`  ⏭️  ${cbSlug}/${envSlug} — já em ${target.branch}`);
      skipped++;
      continue;
    }
    await pgrst(`codebase_environments?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(target),
    });
    console.log(`  ✅ ${cbSlug}/${envSlug}: ${row.branch} → ${target.branch}`);
    patched++;
  }
}

console.log(`\n[patch-envs] ${patched} envs corrigidos, ${skipped} já corretos`);
