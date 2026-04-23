# zammad

Zammad self-hosted deployment for **KLaOS Helpdesk** (`https://help.klaos.ai`) — the internal ticketing system where the Klaos team organizes demands arriving from various tools (Chatwoot, Sentry, infra alerts, email, etc.).

## Architecture

- **Upstream**: [`zammad/zammad-docker-compose`](https://github.com/zammad/zammad-docker-compose) — `docker-compose.yml`, `scenarios/`, and `LICENSE` are verbatim copies, rebased on version bumps via `scripts/update-upstream.sh`. The currently tracked upstream tag is pinned in the `UPSTREAM` file.
- **Customizations**: never in core. Each customization is a [Zammad package (`.zpm`)](https://community.zammad.org/t/packages-tutorial/12079) under `packages/src/<name>/`, built into `packages/build/` and auto-installed by the `zammad-init` container via `/opt/zammad/auto_install/`.
- **Deploy**: Railway project `KLaOS Helpdesk` (production), Cloudflare R2 for attachment storage (via `S3_URL`).

## Layout

```
docker-compose.yml              1:1 copy of upstream (reference for services; Railway provisions each separately)
docker-compose.override.yml     local dev + .zpm auto_install activation
scenarios/                      upstream scenario overlays (reference)
packages/
  src/                          package sources (1 folder per module)
  build/                        built .zpm files (mounted into zammad-init)
scripts/
  build-packages.sh             src/ -> build/
  update-upstream.sh            pulls a new upstream tag, shows diff / applies
.github/workflows/              CI: build packages on push, weekly upstream check
UPSTREAM                        current upstream tag pinned
LICENSE                         AGPLv3 (inherited from upstream)
README.upstream.md              original upstream README for reference
```

## Workflows

### Bump Zammad version

```bash
./scripts/update-upstream.sh              # show diff vs current pinned tag
./scripts/update-upstream.sh --apply      # apply
git diff docker-compose.yml               # review carefully
git add docker-compose.yml UPSTREAM scenarios rancher-compose.yml LICENSE README.upstream.md
git commit -m "chore: bump zammad-docker-compose to X.Y.Z"
git push
```

The GitHub Actions workflow `.github/workflows/sync-upstream.yml` also opens a PR weekly when a new upstream tag is available.

### New customization package

```bash
mkdir -p packages/src/klaos-my-feature
# write the .szpm manifest and package files
./scripts/build-packages.sh               # generates packages/build/klaos-my-feature-X.Y.Z.zpm
git add packages
git commit -m "feat(klaos-my-feature): initial version"
git push
```

## License

This repository is [AGPLv3](LICENSE), inherited from Zammad. Consequences:

- Any modified version served over a network MUST offer source to remote users (§13 AGPLv3). The public link to this repository fulfills that obligation; do not remove the "Source code" link from the UI footer (added by the `klaos-branding` package).
- **No secrets or API keys in this repository.** All runtime configuration (tokens, passwords, S3 credentials, etc.) lives in Railway environment variables.
