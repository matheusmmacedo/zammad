// Patch cirúrgico: corrige base_branch / dev_url / playwright_config errados
// no devpilot.codebases pra valores corretos do gate.mjs hardcoded.
//
// Bug original: seed inicial colocou base_branch=main pra klaos, develop pra
// frontdesk e dev_url=null pra gtm90d. Como devpilot-config.mjs faz merge
// hardcoded ⊕ overrides com overrides vencendo, o runner começou a usar
// branch errada (caso WP #257 PR #32 base=main em vez de dev).
//
// Estratégia: para os 3 codebases problemáticos, faz PATCH explícito com os
// valores certos. Codebases sem hardcoded (zammad/openproject/devpilot)
// permanecem intactos.

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

// Valores corretos extraídos de klaos-agent-runner/src/gate.mjs
const PATCHES = {
  klaos: {
    base_branch: 'dev',
    dev_url: 'https://app-dev.klaos.ai',
    api_url: 'https://api-dev.klaos.ai',
    playwright_config: { kind: 'direct-login', loginUrl: 'https://app-dev.klaos.ai' },
  },
  frontdesk: {
    base_branch: 'klaos-dev',
    dev_url: 'https://app-desk-dev.klaos.ai',
    api_url: null,
    playwright_config: { kind: 'sso-via-klaos', ssoStartUrl: 'https://app-dev.klaos.ai' },
  },
  gtm90d: {
    base_branch: 'master',
    dev_url: 'https://benchmark90s.klaos.ai',
    api_url: null,
    playwright_config: { kind: 'direct-login', loginUrl: 'https://benchmark90s.klaos.ai' },
  },
};

const codebases = await pgrst(`codebases?select=id,slug,base_branch,dev_url,playwright_config&archived_at=is.null&order=slug`);

console.log(`[patch-config] codebases atuais: ${codebases.length}`);
let patched = 0;
for (const cb of codebases) {
  const target = PATCHES[cb.slug];
  if (!target) {
    console.log(`  ⏭️  ${cb.slug} — não está no PATCHES (sem hardcoded), mantém intacto`);
    continue;
  }

  const before = {
    base_branch: cb.base_branch,
    dev_url: cb.dev_url,
    playwright_config: cb.playwright_config,
  };
  const same =
    before.base_branch === target.base_branch &&
    before.dev_url === target.dev_url &&
    JSON.stringify(before.playwright_config) === JSON.stringify(target.playwright_config);
  if (same) {
    console.log(`  ⏭️  ${cb.slug} — já correto`);
    continue;
  }

  await pgrst(`codebases?id=eq.${cb.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(target),
  });
  console.log(`  ✅ ${cb.slug}`);
  console.log(`     base_branch: ${before.base_branch} → ${target.base_branch}`);
  console.log(`     dev_url: ${before.dev_url} → ${target.dev_url}`);
  patched++;
}

console.log(`\n[patch-config] ${patched} codebases corrigidos`);
