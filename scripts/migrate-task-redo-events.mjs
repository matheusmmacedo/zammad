#!/usr/bin/env node
/**
 * Cria devpilot.task_redo_events + RPC pra contar redos por (codebase, wp_id).
 * Idempotente.
 */

import { readFileSync } from 'node:fs';

const envText = readFileSync('C:/dev/gmb/devpilot/.env.local', 'utf8');
const env = Object.fromEntries(envText.split('\n').filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{const[k,...v]=l.split('=');return[k.trim(),v.join('=').trim()];}));
const PAT = process.env.SUPABASE_PAT || env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_PAT;
if (!PAT) {
  console.error('Falta SUPABASE_PAT (Management API token)');
  console.error('Esse script usa a Management API (DDL) — service_role não basta.');
  console.error('Pass via: SUPABASE_PAT=sbp_xxx node scripts/migrate-task-redo-events.mjs');
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
CREATE TABLE IF NOT EXISTS devpilot.task_redo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES devpilot.organizations(id) ON DELETE CASCADE,
  codebase text NOT NULL,
  wp_id integer NOT NULL,
  redo_index integer NOT NULL,                      -- 1, 2, 3 ... ordem do /refaz
  retry_hint text,                                  -- texto que o user posto após /refaz
  prev_pr_url text,                                 -- PR anterior que foi rejeitado
  prev_job_id text,                                 -- bullmq job id que originou
  category text CHECK (category IN ('spec_gap','agent_error','blocker','unclear','other','pending_classification')) DEFAULT 'pending_classification',
  classification_confidence real,                   -- 0.0-1.0 confiança do classify
  classification_reason text,                       -- explicação humana do porquê
  five_whys jsonb,                                  -- {why1: ..., why2: ..., ..., root_cause: ...}
  postmortem_posted_at timestamptz,
  postmortem_comment_id text,                       -- OP comment id se postado
  created_at timestamptz DEFAULT now(),
  classified_at timestamptz
);

CREATE INDEX IF NOT EXISTS task_redo_events_wp_idx ON devpilot.task_redo_events (org_id, codebase, wp_id, redo_index);
CREATE INDEX IF NOT EXISTS task_redo_events_pending_idx ON devpilot.task_redo_events (org_id, category) WHERE category = 'pending_classification';

ALTER TABLE devpilot.task_redo_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_redo_events_read ON devpilot.task_redo_events;
CREATE POLICY task_redo_events_read ON devpilot.task_redo_events FOR SELECT
  USING (org_id IN (SELECT org_id FROM devpilot.org_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS task_redo_events_write_service ON devpilot.task_redo_events;
CREATE POLICY task_redo_events_write_service ON devpilot.task_redo_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON devpilot.task_redo_events TO authenticated;
GRANT ALL ON devpilot.task_redo_events TO service_role;

-- RPC: contagem de redos por WP nos últimos N dias (alimenta kanban + history)
CREATE OR REPLACE FUNCTION devpilot.task_redo_counts(p_org_id uuid, p_days int DEFAULT 30)
RETURNS TABLE (codebase text, wp_id integer, redo_count bigint, last_category text, last_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    codebase,
    wp_id,
    COUNT(*) AS redo_count,
    (array_agg(category ORDER BY created_at DESC))[1] AS last_category,
    MAX(created_at) AS last_at
  FROM devpilot.task_redo_events
  WHERE org_id = p_org_id
    AND created_at > now() - (p_days || ' days')::interval
  GROUP BY codebase, wp_id
  ORDER BY redo_count DESC, last_at DESC;
$$;

GRANT EXECUTE ON FUNCTION devpilot.task_redo_counts(uuid, int) TO authenticated, service_role;

-- RPC: agregação por categoria (Pareto pra dashboards)
CREATE OR REPLACE FUNCTION devpilot.task_redo_category_breakdown(p_org_id uuid, p_days int DEFAULT 30)
RETURNS TABLE (category text, count bigint, pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT category FROM devpilot.task_redo_events
    WHERE org_id = p_org_id AND created_at > now() - (p_days || ' days')::interval
  )
  SELECT
    category,
    COUNT(*) AS count,
    ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM base), 0), 1) AS pct
  FROM base
  GROUP BY category
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION devpilot.task_redo_category_breakdown(uuid, int) TO authenticated, service_role;
`;

await ddl(sql, 'task_redo_events + RPCs');
console.log('\n✅ Migration aplicada.\n');
