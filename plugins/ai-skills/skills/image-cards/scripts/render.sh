#!/usr/bin/env bash
# Renders cards with Chromium from the official Playwright image, offline (--network none). The first run installs
# playwright-core (same version as the image) into a cache directory with network access; rendering never has it.
# Run from the repository root; every path argument is relative to it. Arguments go to render-cards.mjs.
# Env: PLAYWRIGHT_VERSION (default 1.65.0), PLAYWRIGHT_IMAGE, CARDS_CACHE_DIR (default .cache/image-cards),
#      CARDS_NO_DOCKER=1 to run with a local Node and playwright-core instead.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(pwd)"
version="${PLAYWRIGHT_VERSION:-1.65.0}"
image="${PLAYWRIGHT_IMAGE:-mcr.microsoft.com/playwright:v${version}-noble}"
cache="${CARDS_CACHE_DIR:-$root/.cache/image-cards}"
deps="$cache/playwright-core-$version"

if [ "${CARDS_NO_DOCKER:-}" = "1" ]; then
  exec node "$here/render-cards.mjs" --root "$root" "$@"
fi

command -v docker >/dev/null || { echo "docker is required (or set CARDS_NO_DOCKER=1)" >&2; exit 1; }
if [ ! -f "$deps/node_modules/playwright-core/package.json" ]; then
  mkdir -p "$deps"
  docker run --rm --user "$(id -u):$(id -g)" -e npm_config_cache=/deps/.npm -v "$deps":/deps -w /deps "$image" \
    npm install --no-audit --no-fund --ignore-scripts --prefix /deps "playwright-core@$version" >&2
fi

exec docker run --rm --init --ipc=host --network none --user "$(id -u):$(id -g)" \
  -v "$root":/work -v "$here":/skill:ro -v "$deps":/deps:ro -w /work \
  -e PLAYWRIGHT_CORE_PATH=/deps/node_modules/playwright-core -e HOME=/tmp \
  "$image" node /skill/render-cards.mjs --root /work "$@"
