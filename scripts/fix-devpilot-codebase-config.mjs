// Fix discrepancies entre devpilot.codebases e gate.mjs (verdadeiro source of truth).
// O runner faz merge { ...hardcoded, ...overrides } — então devpilot SOBRESCREVE
// hardcoded. Bugs no seed inicial deixaram klaos.base_branch=main, devpilot
// override venceu, runner começou a usar branch errada (caso WP #257 PR #32).
//
// Fonte da verdade pra config técnica é gate.mjs do runner. Devpilot só deveria
// ter overrides INTENCIONAIS (em geral nenhum por enquanto) — campos null em
// devpilot fazem fallback pro hardcoded automaticamente (linha 109 do
// devpilot-config.mjs filtra null/undefined antes de mergear).
//
// Strategy: zerar campos técnicos em devpilot.codebases (base_branch, dev_url,
// api_url, playwright_config, requires_approval) pra deixar que o hardcoded
// vença. Mantém só metadados de display (display_name, slug).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, '..', '..', 'devpilot', '.env.local');

let SUPABASE_URL, SUPABASE_KEY;
try {
  const env = readFileSync(ENV_PATH, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^(\w+)=(.+)$/);
    if (!m) continue;
    if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL') SUPABASE_URL = m[2].trim().replace(/^["']|["']$/g, '');
    if (m[1] === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_KEY = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) {
  console.error(`Falha ao ler ${ENV_PATH}: ${e.message}`);
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados.');
  process.exit(1);
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

const codebases = await pgrst(`codebases?select=id,slug,base_branch,dev_url,api_url,playwright_config,requires_approval&archived_at=is.null&order=slug`);
console.log(`[fix-config] ${codebases.length} codebases encontradas`);

let fixed = 0;
for (const cb of codebases) {
  const patch = {
    base_branch: null,
    dev_url: null,
    api_url: null,
    playwright_config: null,
    // requires_approval mantém — é decisão de policy, não config técnica
  };
  // Só patch se tem algum campo a limpar
  if (cb.base_branch || cb.dev_url || cb.api_url || cb.playwright_config) {
    await pgrst(`codebases?id=eq.${cb.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    console.log(`  ✅ ${cb.slug} — limpo (base=${cb.base_branch}/dev_url=${cb.dev_url} → null, hardcoded volta a vencer)`);
    fixed++;
  } else {
    console.log(`  ⏭️  ${cb.slug} — já limpo`);
  }
}

console.log(`\n[fix-config] ${fixed}/${codebases.length} codebases corrigidos`);
console.log(`[fix-config] runner agora vai usar gate.mjs hardcoded como source of truth.`);
console.log(`[fix-config] futuras edições via /repos/[slug] vão preencher de volta com valores certos.`);
