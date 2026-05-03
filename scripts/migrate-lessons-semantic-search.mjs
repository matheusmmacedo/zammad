#!/usr/bin/env node
/**
 * Cria RPC devpilot.match_lessons() pra busca semântica via pgvector.
 * Idempotente. Roda contra o projeto Supabase do devpilot via Management API.
 */

import { readFileSync } from 'node:fs';

const envText = readFileSync('C:/dev/gmb/devpilot/.env.local', 'utf8');
const env = Object.fromEntries(envText.split('\n').filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{const[k,...v]=l.split('=');return[k.trim(),v.join('=').trim()];}));
const PAT = process.env.SUPABASE_PAT || env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_PAT;
if (!PAT) {
  console.error('Falta SUPABASE_PAT (Management API token).');
  console.error('Pass via: SUPABASE_PAT=sbp_xxx node scripts/migrate-lessons-semantic-search.mjs');
  process.exit(1);
}

async function ddl(query, label) {
  const r = await fetch('https://api.supabase.com/v1/projects/zsueidjedntqukigoplq/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) { console.error(`[${label}] ERROR:`, j); throw new Error(label); }
  console.log(`[${label}] ok`);
  return j;
}

const sql = `
-- RPC: busca semântica em lessons via cosine similarity (pgvector <=>).
-- Recebe query embedding (1536d, OpenAI text-embedding-3-small) e retorna top-N.
-- SECURITY INVOKER pra herdar RLS da tabela (cada user só vê lessons da própria org).
CREATE OR REPLACE FUNCTION devpilot.match_lessons(
  query_embedding vector(1536),
  match_count integer DEFAULT 10,
  filter_org_id uuid DEFAULT NULL,
  filter_codebase_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  codebase_id uuid,
  category text,
  title text,
  body text,
  source text,
  hits_count integer,
  helpful_score integer,
  created_at timestamptz,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    l.id,
    l.codebase_id,
    l.category,
    l.title,
    l.body,
    l.source,
    l.hits_count,
    l.helpful_score,
    l.created_at,
    1 - (l.embedding <=> query_embedding) AS similarity
  FROM devpilot.lessons l
  WHERE l.archived_at IS NULL
    AND l.embedding IS NOT NULL
    AND (filter_org_id IS NULL OR l.org_id = filter_org_id)
    AND (filter_codebase_id IS NULL OR l.codebase_id = filter_codebase_id)
  ORDER BY l.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Garante que authenticated role pode chamar a RPC.
GRANT EXECUTE ON FUNCTION devpilot.match_lessons(vector, integer, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION devpilot.match_lessons(vector, integer, uuid, uuid) TO service_role;
`;

await ddl(sql, 'create match_lessons RPC');
console.log('\n✅ Migração aplicada — devpilot.match_lessons disponível.');
console.log('   Server action pode chamar: supabase.schema("devpilot").rpc("match_lessons", { query_embedding, match_count, filter_org_id })');
