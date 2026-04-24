#!/usr/bin/env bash
# Build each package under packages/src/ into a Zammad-compatible .zpm file.
#
# Zammad's .zpm format is a JSON file:
#   { "name": "...", "version": "...", "vendor": "...", "url": "...",
#     "license": "...", "dependencies": [],
#     "files": [ { "location": "...", "permission": "644", "content": "<base64>" } ] }
#
# Previous versions of this script used `tar -czf` which Zammad does not
# accept. See https://community.zammad.org/t/packages-tutorial/12079 for the
# actual format.

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

  # Extract metadata from XML manifest (shallow parse — single-value fields only)
  meta_get() { grep -oE "<$1>[^<]+" "$manifest" | head -1 | sed "s/<$1>//"; }

  name="$(meta_get name)"
  name="${name:-$pkg_name}"
  version="$(meta_get version)"
  version="${version:-0.0.0}"
  vendor="$(meta_get organization)"
  vendor="${vendor:-unknown}"
  url="$(meta_get url)"
  license="$(meta_get license)"
  author="$(meta_get author)"

  out="$BUILD_DIR/${pkg_name}-${version}.zpm"
  echo "Building $pkg_name $version -> $out"

  # Build the files array using node. Walk the package dir, skip the manifest
  # itself, base64-encode each file, emit JSON.
  node --input-type=module -e "
    import { readFileSync, statSync } from 'node:fs';
    import { readdir } from 'node:fs/promises';
    import { join, relative } from 'node:path';

    async function walk(dir) {
      const out = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await walk(full));
        else if (entry.isFile()) out.push(full);
      }
      return out;
    }

    const base = process.argv[1];
    const manifest = process.argv[2];
    const meta = {
      name: process.argv[3], version: process.argv[4], vendor: process.argv[5],
      url: process.argv[6], license: process.argv[7], author: process.argv[8],
    };

    const paths = await walk(base);
    const files = paths
      .filter(p => p !== manifest)
      .map(p => ({
        location: relative(base, p).split(/[\\\\/]/).join('/'),
        permission: '644',
        content: readFileSync(p).toString('base64'),
      }));

    const pkg = {
      name: meta.name, version: meta.version, vendor: meta.vendor,
      url: meta.url, license: meta.license, author: meta.author,
      dependencies: [],
      files,
    };
    process.stdout.write(JSON.stringify(pkg));
  " "$pkg_dir" "$manifest" "$name" "$version" "$vendor" "$url" "$license" "$author" > "$out"

  size=$(wc -c < "$out")
  echo "  -> ${size} bytes, $(node -e "console.log(JSON.parse(require('fs').readFileSync('$out','utf8')).files.length)") files"
done

echo
echo "Done. Build directory:"
ls -la "$BUILD_DIR"
