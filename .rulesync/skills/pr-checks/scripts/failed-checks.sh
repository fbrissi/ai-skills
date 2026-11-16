#!/usr/bin/env bash
# Print the evidence for every failing check on a GitHub pull request: the failing
# job and step, the error lines with the log lines before them, check-run output
# for checks without an Actions log, and failed runs on the head commit that are
# not reported as PR checks (for example workflow_dispatch runs).
# Usage: failed-checks.sh [<pr>] [-R owner/repo] [--context N] [--max-errors N]
# Needs bash, gh (authenticated), jq.
set -euo pipefail

pr=""
repo=""
context=40
max_errors=3
while [ $# -gt 0 ]; do
  case "$1" in
    -R | --repo) repo="$2"; shift 2 ;;
    --context) context="$2"; shift 2 ;;
    --max-errors) max_errors="$2"; shift 2 ;;
    -h | --help) sed -n '2,8p' "$0"; exit 0 ;;
    *) pr="$1"; shift ;;
  esac
done

repo_args=()
[ -n "$repo" ] && repo_args=(-R "$repo")
[ -n "$repo" ] || repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

pr_json="$(gh pr view ${pr:+"$pr"} ${repo_args[@]+"${repo_args[@]}"} --json number,headRefOid,headRefName,url)"
number="$(jq -r .number <<<"$pr_json")"
head_sha="$(jq -r .headRefOid <<<"$pr_json")"
echo "PR #$number $(jq -r .url <<<"$pr_json")"
echo "Head: $(jq -r .headRefName <<<"$pr_json") @ $head_sha"

checks="$(gh pr checks "$number" ${repo_args[@]+"${repo_args[@]}"} --json name,state,bucket,link,workflow 2>/dev/null || true)"
[ -n "$checks" ] || checks='[]'
echo
echo "Checks: $(jq -r 'group_by(.bucket) | map("\(.[0].bucket)=\(length)") | join(", ")' <<<"$checks")"

strip() { sed -E $'s/\x1b\\[[0-9;]*[A-Za-z]//g; s/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z ?//'; }

print_errors() {
  awk -v ctx="$context" -v max="$max_errors" '
    { buf[NR % ctx] = $0 }
    /##\[error\]/ && shown < max {
      print "  --- log before error " (shown + 1) " ---"
      start = NR - ctx + 1; if (start < 1) start = 1
      for (i = start; i <= NR; i++) print "  " buf[i % ctx]
      shown++
    }
    END { if (shown == 0) { print "  (no ##[error] line; last lines of the log)"; start = NR - ctx + 1; if (start < 1) start = 1; for (i = start; i <= NR; i++) print "  " buf[i % ctx] } }
  '
}

seen_jobs=" "
show_job() {
  local job="$1"
  case "$seen_jobs" in *" $job "*) return ;; esac
  seen_jobs="$seen_jobs$job "
  local meta
  meta="$(gh api "repos/$repo/actions/jobs/$job")"
  echo "Job: $(jq -r '.name' <<<"$meta") (conclusion: $(jq -r '.conclusion' <<<"$meta"))"
  jq -r '.steps[]? | select(.conclusion == "failure") | "Failed step: \(.number). \(.name)"' <<<"$meta"
  gh api "repos/$repo/actions/jobs/$job/logs" 2>/dev/null | strip | print_errors || echo "  (log not available)"
}

failing="$(jq -c '.[] | select(.bucket == "fail" or .bucket == "cancel")' <<<"$checks")"
while IFS= read -r check; do
  [ -n "$check" ] || continue
  link="$(jq -r .link <<<"$check")"
  echo
  echo "=== $(jq -r '.workflow // ""' <<<"$check") / $(jq -r .name <<<"$check") [$(jq -r .state <<<"$check")]"
  echo "Link: $link"
  if [[ "$link" =~ /actions/runs/[0-9]+/job/([0-9]+) ]]; then
    show_job "${BASH_REMATCH[1]}"
  elif [[ "$link" =~ /runs/([0-9]+) ]]; then
    gh api "repos/$repo/check-runs/${BASH_REMATCH[1]}" \
      --jq '"Check run output: \(.output.title // "-")\n\(.output.summary // "")\n\(.output.text // "")\nDetails: \(.details_url // "-")"'
    echo "(No Actions log for this check; its run may be listed below.)"
  else
    echo "(External check: open the link for details.)"
  fi
done <<<"$failing"

runs="$(gh api "repos/$repo/actions/runs?head_sha=$head_sha&per_page=50" \
  --jq '[.workflow_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "startup_failure")] | map({id, name, event})')"
while IFS= read -r run; do
  [ -n "$run" ] || continue
  run_id="$(jq -r .id <<<"$run")"
  jobs="$(gh api "repos/$repo/actions/runs/$run_id/jobs" --jq '.jobs[] | select(.conclusion == "failure") | .id')"
  for job in $jobs; do
    case "$seen_jobs" in *" $job "*) continue ;; esac
    echo
    echo "=== Run $(jq -r .name <<<"$run") ($(jq -r .event <<<"$run"), run $run_id), not reported as a PR check"
    show_job "$job"
  done
done < <(jq -c '.[]' <<<"$runs")
