#!/bin/bash
# KLaOS init wrapper. Runs before /opt/zammad/bin/docker-entrypoint.
# When invoked with `zammad-init`, installs any .zpm packages staged in
# /opt/zammad/auto_install/ that aren't already marked as installed.
# For any other arg (railsserver, websocket, scheduler, nginx), acts as a
# plain passthrough to the upstream entrypoint.
set -euo pipefail

AUTO_DIR="/opt/zammad/auto_install"

install_packages() {
  if [ ! -d "$AUTO_DIR" ]; then return; fi
  shopt -s nullglob
  local zpms=("$AUTO_DIR"/*.zpm)
  if [ "${#zpms[@]}" -eq 0 ]; then return; fi

  echo "klaos-init: found ${#zpms[@]} .zpm in $AUTO_DIR — running zammad:package:install …"
  cd /opt/zammad || exit 1
  for zpm in "${zpms[@]}"; do
    echo "  >> $zpm"
    # Modern Zammad uses `rails zammad:package:install <path>` (positional
    # arg), not the older rake-bracket form. We treat "already installed"
    # as success so the wrapper is idempotent across restarts.
    if ! bundle exec rake zammad:package:install "$zpm" 2>&1 | sed 's/^/     /'; then
      echo "     (already installed or failed — continuing)"
    fi
  done
}

if [ "${1:-}" = "zammad-init" ]; then
  install_packages
fi

exec /opt/zammad/bin/docker-entrypoint "$@"
