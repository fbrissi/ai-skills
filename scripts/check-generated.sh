#!/usr/bin/env bash
# Fails if `rulesync generate` would change any tracked or non-ignored file.
# Runs on a copy of the files git would publish, so gitignored outputs (absent in CI) do not matter.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

package_version="$(node -p "require('$root/package.json').version")"
plugin_version="$(node -p "require('$root/plugins/ai-skills/.claude-plugin/plugin.json').version")"
if [ "$package_version" != "$plugin_version" ]; then
  echo "Plugin version $plugin_version does not match package.json $package_version. Update plugins/ai-skills/.claude-plugin/plugin.json." >&2
  exit 1
fi
rulesync="$root/node_modules/.bin/rulesync"
[ -x "$rulesync" ] || { echo "rulesync not found; run npm ci" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git -C "$root" ls-files -z --cached --others --exclude-standard | (cd "$root" && xargs -0 tar -cf -) | tar -xf - -C "$work"

cd "$work"
git init -q
git add -A
git -c user.name=check -c user.email=check@localhost commit -q -m snapshot
"$rulesync" generate >/dev/null

changes="$(git status --porcelain)"
if [ -n "$changes" ]; then
  printf '%s\n' "$changes" >&2
  echo "Generated outputs are stale. Run: npm run generate" >&2
  exit 1
fi
echo "Generated outputs are up to date."
