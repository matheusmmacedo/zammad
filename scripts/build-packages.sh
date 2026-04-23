#!/usr/bin/env bash
# Build all packages in packages/src/ into .zpm archives in packages/build/.
# Each package in packages/src/<name>/ must contain a .szpm manifest file
# (either <name>.szpm or <name_with_underscores>.szpm).

set -euo pipefail

SRC_DIR="packages/src"
BUILD_DIR="packages/build"

mkdir -p "$BUILD_DIR"

if [ ! -d "$SRC_DIR" ] || [ -z "$(ls -A "$SRC_DIR" 2>/dev/null)" ]; then
  echo "No packages in $SRC_DIR — nothing to build."
  exit 0
fi

for pkg_dir in "$SRC_DIR"/*/; do
  pkg_name="$(basename "$pkg_dir")"
  manifest_underscore="$pkg_dir${pkg_name//-/_}.szpm"
  manifest_plain="$pkg_dir$pkg_name.szpm"

  if [ -f "$manifest_underscore" ]; then
    manifest="$manifest_underscore"
  elif [ -f "$manifest_plain" ]; then
    manifest="$manifest_plain"
  else
    echo "SKIP $pkg_name: no .szpm manifest found"
    continue
  fi

  version="$(grep -oE '<version>[^<]+' "$manifest" | head -1 | sed 's/<version>//')"
  version="${version:-0.0.0}"
  out="$BUILD_DIR/${pkg_name}-${version}.zpm"

  echo "Building $pkg_name $version -> $out"
  (cd "$pkg_dir" && tar -czf "../../../$out" ./*)
done

echo
echo "Done. Build directory:"
ls -la "$BUILD_DIR"
