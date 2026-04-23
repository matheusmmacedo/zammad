#!/usr/bin/env bash
# Rebase onto a new upstream release of zammad/zammad-docker-compose.
#
# Usage:
#   ./scripts/update-upstream.sh                     show diff vs latest upstream
#   ./scripts/update-upstream.sh --apply             apply latest upstream
#   ./scripts/update-upstream.sh v15.2.4             diff against a specific tag
#   ./scripts/update-upstream.sh v15.2.4 --apply     apply a specific tag

set -euo pipefail

UPSTREAM_REPO="zammad/zammad-docker-compose"
CURRENT_TAG="$(tr -d '[:space:]' < UPSTREAM)"

APPLY=0
TARGET_TAG=""

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) TARGET_TAG="$arg" ;;
  esac
done

if [ -z "$TARGET_TAG" ]; then
  TARGET_TAG="$(curl -sI "https://github.com/$UPSTREAM_REPO/releases/latest" \
    | awk -F/ 'tolower($1) ~ /^location:/ {print $NF}' \
    | tr -d '\r')"
fi

echo "Current pinned: $CURRENT_TAG"
echo "Target:         $TARGET_TAG"

if [ "$CURRENT_TAG" = "$TARGET_TAG" ]; then
  echo "Already up-to-date."
  exit 0
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "Fetching $TARGET_TAG ..."
curl -sL "https://github.com/$UPSTREAM_REPO/archive/refs/tags/$TARGET_TAG.tar.gz" -o "$STAGE/src.tgz"
tar -xzf "$STAGE/src.tgz" -C "$STAGE"
SRC="$STAGE/zammad-docker-compose-${TARGET_TAG#v}"

FILES=(docker-compose.yml rancher-compose.yml LICENSE)
DIRS=(scenarios)

if [ $APPLY -eq 1 ]; then
  for f in "${FILES[@]}"; do
    [ -f "$SRC/$f" ] && cp "$SRC/$f" "./$f"
  done
  for d in "${DIRS[@]}"; do
    [ -d "$SRC/$d" ] && rm -rf "./$d" && cp -r "$SRC/$d" "./$d"
  done
  [ -f "$SRC/README.md" ] && cp "$SRC/README.md" "./README.upstream.md"
  echo "$TARGET_TAG" > UPSTREAM
  echo "Applied. Review 'git diff' before committing."
else
  echo
  echo '--- diff (preview) ---'
  for f in "${FILES[@]}"; do
    if [ -f "$SRC/$f" ]; then
      diff -u "./$f" "$SRC/$f" || true
    fi
  done
  echo
  echo 'Run with --apply to overwrite files.'
fi
