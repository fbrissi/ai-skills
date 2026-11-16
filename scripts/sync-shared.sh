#!/usr/bin/env bash
# Copy shared/ files into the skills listed in shared/manifest.txt, and remove
# copies of shared files from skills that are no longer listed.
# Usage: scripts/sync-shared.sh [--check]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
check=false
[ "${1:-}" = "--check" ] && check=true
stale=0
expected=" "

while read -r src skills; do
  case "$src" in ''|'#'*) continue ;; esac
  for skill in $skills; do
    skill_dir="$root/.rulesync/skills/$skill"
    if [ ! -f "$skill_dir/SKILL.md" ]; then
      echo "unknown skill in manifest: $skill" >&2
      exit 1
    fi
    expected="$expected$skill/$src "
    dest="$skill_dir/$src"
    if $check; then
      if ! cmp -s "$root/shared/$src" "$dest"; then
        echo "stale: .rulesync/skills/$skill/$src" >&2
        stale=1
      elif [ -x "$root/shared/$src" ] && [ ! -x "$dest" ]; then
        echo "not executable: .rulesync/skills/$skill/$src" >&2
        stale=1
      fi
    else
      mkdir -p "$(dirname "$dest")"
      cp -p "$root/shared/$src" "$dest"
    fi
  done
done < "$root/shared/manifest.txt"

while IFS= read -r src; do
  for skill_dir in "$root"/.rulesync/skills/*/; do
    skill="$(basename "$skill_dir")"
    [ -f "$skill_dir$src" ] || continue
    case "$expected" in *" $skill/$src "*) continue ;; esac
    if $check; then
      echo "orphan: .rulesync/skills/$skill/$src (not listed in shared/manifest.txt)" >&2
      stale=1
    else
      rm "$skill_dir$src"
      rmdir "$(dirname "$skill_dir$src")" 2>/dev/null || true
    fi
  done
done < <(cd "$root/shared" && find . -type f ! -name manifest.txt | sed 's|^\./||')

if $check && [ "$stale" -ne 0 ]; then
  echo "run: npm run sync" >&2
  exit 1
fi
