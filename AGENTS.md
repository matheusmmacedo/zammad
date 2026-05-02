# Zammad Klaos — Development Guidelines

## 🛡️ Diretiva crítica de fork — JAMAIS perder upstream NEM customs

Este repo é um **fork de Zammad upstream** (`zammad/zammad`).
Versão upstream rastreada em `UPSTREAM` (atualmente `v15.2.3`).

A camada de customização Klaos vive em **`packages/src/klaos-*/`** como
**Zammad Packages (ZPM)** — sistema oficial Zammad de extensão.

```
packages/
  src/
    klaos-branding/              ← package fonte (logo, cores, custom CSS, etc)
      assets/
      custom.css
      db/
      klaos_branding.szpm
      README.md
  build/
    klaos-branding-0.1.0.zpm     ← build do package (instalado no boot)

scripts/klaos-init.sh            ← roda zammad:package:install no boot do container
```

### Regra de ouro

1. **NUNCA edite arquivos fora de `packages/src/klaos-*/` ou `scripts/klaos-init.sh`** sem justificativa.
2. Bug fix Klaos-specific? **Crie ou estende um package** em `packages/src/klaos-*/`.
3. Bug fix de funcionalidade core do Zammad?
   - Verifique primeiro se Zammad upstream já corrigiu (`git log upstream/develop -- <path>`).
   - Se sim: mire `git pull upstream` em vez de patch local.
   - Se não: tente fazer override via package (`klaos_object_manager.rb`, hooks, etc).
   - Só patch direto em código upstream se PROVADAMENTE impossível via package — marque verdict com `upstream_patch_justified: true` e explique.

### Por que isso importa

Zammad upstream pula versões frequentemente (15.x → 16.x). Patches sem isolamento
→ rebase doloroso a cada major. Packages são **first-class** no Zammad: instalam
via `rake zammad:package:install`, sobrevivem upgrades, são desinstaláveis.

### Padrão de criar/estender um package Klaos

```bash
# Estrutura mínima
packages/src/klaos-<feature>/
  klaos_<feature>.szpm     # manifest (XML/zammad-package.json)
  README.md
  config/
    routes.rb              # se adiciona rota
  app/
    models/
      klaos_<feature>/...  # NUNCA renomeie ou substitua model upstream — extend
  db/
    addon/                 # migrações do package (sobreviem upgrade)
```

Build: o `klaos-init.sh` faz `rake zammad:package:install file=packages/build/<name>.zpm`
após cada deploy. Se você adicionar/mudar package, **gere novo .zpm e commite em `packages/build/`**.

---

## Build / Test / Lint

- Zammad é uma app Rails monolítica grande. Testes unitários: `bundle exec rspec spec/...`
- Pra packages: testes vão em `packages/src/klaos-*/spec/`
- Lint Ruby: `bundle exec rubocop -a`
- **NÃO rode** `rails server` localmente sem todo o setup (Postgres + Redis + Elasticsearch + memcached). Use Docker Compose.

---

## Deploy

Container roda via Railway (KLaOS Helpdesk project). Boot:
1. `klaos-init.sh` instala todos os `.zpm` em `packages/build/`
2. `rake zammad:package:migrate <pkg-path>` roda migrações dos packages
3. `rake zammad:package:post_install` corre hooks pós-install
4. Zammad sobe normal

Crash no boot = provavelmente package mal-formado ou migração quebrada. Veja log
do `zammad-init` service na Railway.

---

## Código source-of-truth

- AGENTES de fix automático (klaos-agent-runner) leem ESTE arquivo via `loadRepoContext`.
- Mude regras aqui se a estratégia evoluir.

---

## Migrations & Auto-apply pelo runner

<!-- DEVPILOT-MIGRATIONS-SKILL: gerenciado por scripts/update-agents-md-all-repos.mjs no zammad. Editar manualmente vai sobrescrever no próximo run. -->

**Você NÃO precisa rodar `db:migrate` manualmente** — o `klaos-agent-runner`
roda `bin/rails db:migrate RAILS_ENV=<env>` em cada etapa do pipeline:

- Pipeline configurado: `dev` → `prod`
- PR mergeado em `dev` → runner faz `bundle exec rails db:migrate` no
  container daquele env.
- Promote PR `dev → main` → roda em prod (env `prod` com
  `requires_approval=true` exige humano).

**Regras pra escrever a migration:**
- Use o gerador: `bin/rails g migration AddXyzToFoos` (sem editar timestamps).
- **Reversível:** todo `up` precisa de `down` correspondente, ou usar
  `change` quando seguro. Migrations irreversíveis precisam de
  `raise ActiveRecord::IrreversibleMigration` no down.
- **Sem dados em massa em transação:** UPDATE/DELETE em milhões de rows tem
  que ir em `disable_ddl_transaction!` + batches de 1k.

Ad-hoc/troubleshooting: `bin/rails dbconsole` no container, ou
`mcp__supabase__execute_sql` se a DB tiver Supabase wrapper.

