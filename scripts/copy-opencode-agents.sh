#!/usr/bin/env bash
# Copy the OpenCode agents Rulesync generates in .opencode/agents/ into the committed
# plugins/ai-skills/opencode/agent/, removing agents that no longer exist.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/.opencode/agents"
dest="$root/plugins/ai-skills/opencode/agent"

[ -d "$src" ] || { echo "missing $src; run rulesync generate first" >&2; exit 1; }
rm -rf "$dest"
mkdir -p "$dest"
cp "$src"/*.md "$dest"/
