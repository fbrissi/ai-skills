#!/usr/bin/env bash
# Verifies that the `skills` CLI discovers every skill in .rulesync/skills from the files git would publish (ignored files excluded).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
expected=$(find "$root/.rulesync/skills" -mindepth 2 -maxdepth 2 -name SKILL.md -not -path '*/.curated/*' | wc -l | tr -d ' ')

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git -C "$root" ls-files -z --cached --others --exclude-standard | (cd "$root" && xargs -0 tar -cf -) | tar -xf - -C "$work"

output="$(DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 npx -y skills@1.8.1 add "$work" --list 2>&1)"
found=$(printf '%s\n' "$output" | sed -E $'s/\x1b\\[[0-9;]*m//g' | grep -cE '^│    [a-z0-9-]+$' || true)

if [ "$found" -ne "$expected" ]; then
  printf '%s\n' "$output"
  echo "skills CLI found $found skills, expected $expected." >&2
  exit 1
fi
echo "skills CLI discovers all $found skills."
