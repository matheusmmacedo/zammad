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
