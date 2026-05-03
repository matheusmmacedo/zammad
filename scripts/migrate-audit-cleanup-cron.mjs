// Migration: enable pg_cron and schedule monthly cleanup de audit_log + job_history > 90 dias.
// Roda via Supabase Management API. Idempotente.
//
// Uso: SUPABASE_PAT=sbp_xxx node scripts/migrate-audit-cleanup-cron.mjs
//
// Tabelas afetadas:
//   - devpilot.audit_log: rows com created_at < now() - 90 days deletadas mensalmente
//   - devpilot.job_history: idem
// Free tier Supabase tem 500MB; sem cleanup essas tabelas enchem em ~6 meses de uso pesado.

const PROJECT_REF = process.env.DEVPILOT_PROJECT_REF || 'zsueidjedntqukigoplq';
const PAT = process.env.SUPABASE_PAT;

if (!PAT) {
  console.error('Missing SUPABASE_PAT (Personal Access Token from Supabase dashboard).');
  process.exit(1);
}

async function exec(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const STATEMENTS = [
  // Habilita pg_cron (idempotente — não falha se já existe)
  `CREATE EXTENSION IF NOT EXISTS pg_cron;`,

  // Função de cleanup. SECURITY DEFINER pra rodar com privilégios do dono.
  `CREATE OR REPLACE FUNCTION devpilot.cleanup_old_audit_and_history()
   RETURNS TABLE(deleted_audit bigint, deleted_history bigint)
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = devpilot, public
   AS $$
   DECLARE
     audit_count bigint;
     history_count bigint;
   BEGIN
     DELETE FROM devpilot.audit_log
     WHERE created_at < now() - interval '90 days';
     GET DIAGNOSTICS audit_count = ROW_COUNT;

     DELETE FROM devpilot.job_history
     WHERE COALESCE(finished_at, enqueued_at, created_at) < now() - interval '90 days';
     GET DIAGNOSTICS history_count = ROW_COUNT;

     INSERT INTO devpilot.audit_log (scope, action, target, diff)
     VALUES (
       'platform',
       'cleanup_cron',
       'audit_log+job_history',
       jsonb_build_object('deleted_audit', audit_count, 'deleted_history', history_count, 'cutoff', '90 days')
     );

     RETURN QUERY SELECT audit_count, history_count;
   END;
   $$;`,

  // Remove agendamentos antigos com mesmo nome (idempotência)
  `SELECT cron.unschedule(jobid)
   FROM cron.job
   WHERE jobname = 'devpilot-cleanup-90d';`,

  // Schedule: dia 1 de cada mês às 03:00 UTC
  `SELECT cron.schedule(
     'devpilot-cleanup-90d',
     '0 3 1 * *',
     $$SELECT devpilot.cleanup_old_audit_and_history();$$
   );`,
];

console.log(`[cleanup-cron] aplicando em projeto ${PROJECT_REF}`);

let applied = 0;
for (const sql of STATEMENTS) {
  const head = sql.slice(0, 80).replace(/\s+/g, ' ');
  try {
    await exec(sql);
    applied++;
    console.log(`  ✅ ${head}`);
  } catch (err) {
    // unschedule pode falhar se job não existe — ignora
    if (sql.includes('cron.unschedule')) {
      console.log(`  ⏭️  ${head} (sem job pra remover, ok)`);
      continue;
    }
    console.error(`  ❌ ${head}\n     ${err.message}`);
    process.exit(1);
  }
}

console.log(`\n[cleanup-cron] ${applied}/${STATEMENTS.length} statements ok`);
console.log(`[cleanup-cron] cron job 'devpilot-cleanup-90d' ativo — dia 1 às 03:00 UTC`);
console.log(`[cleanup-cron] pra rodar manualmente:`);
console.log(`  SELECT * FROM devpilot.cleanup_old_audit_and_history();`);
