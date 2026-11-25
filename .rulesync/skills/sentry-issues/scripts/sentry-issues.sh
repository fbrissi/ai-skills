#!/usr/bin/env bash
# Read and update Sentry issues through the Sentry REST API, as compact JSON.
#
# Usage:
#   sentry-issues.sh list [--projects a,b] [--environment prod] [--period 7d]
#                         [--min-events N] [--min-users N] [--limit N]
#                         [--query "is:unresolved"] [--sort freq]
#   sentry-issues.sh event <issue-id> [latest|oldest|recommended|<event-id>]
#   sentry-issues.sh resolve <issue-id> [resolved|resolvedInNextRelease]
#
# Environment: SENTRY_AUTH_TOKEN (required, never printed), SENTRY_ORG
# (required), SENTRY_BASE_URL (default https://sentry.io).
# Requires: bash, curl, jq.
set -euo pipefail

: "${SENTRY_AUTH_TOKEN:?SENTRY_AUTH_TOKEN is not set}"
: "${SENTRY_ORG:?SENTRY_ORG is not set}"
base="${SENTRY_BASE_URL:-https://sentry.io}"
base="${base%/}/api/0"

api() {
  local method="$1" path="$2"; shift 2
  curl -fsS --get -X "$method" "$base$path" \
    -H @<(printf 'Authorization: Bearer %s\n' "$SENTRY_AUTH_TOKEN") "$@"
}

cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in
  list)
    projects="" environment="" period="14d" min_events=0 min_users=0 limit=25
    query="is:unresolved" sort="freq"
    while [ $# -gt 0 ]; do
      case "$1" in
        --projects) projects="${2:?}"; shift 2 ;;
        --environment) environment="${2:?}"; shift 2 ;;
        --period) period="${2:?}"; shift 2 ;;
        --min-events) min_events="${2:?}"; shift 2 ;;
        --min-users) min_users="${2:?}"; shift 2 ;;
        --limit) limit="${2:?}"; shift 2 ;;
        --query) query="${2:?}"; shift 2 ;;
        --sort) sort="${2:?}"; shift 2 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
      esac
    done
    args=(--data-urlencode "query=$query" --data-urlencode "statsPeriod=$period"
          --data-urlencode "sort=$sort" --data-urlencode "limit=100")
    [ -n "$environment" ] && args+=(--data-urlencode "environment=$environment")
    if [ -n "$projects" ]; then
      IFS=',' read -r -a slugs <<< "$projects"
      for slug in "${slugs[@]}"; do
        [ -z "$slug" ] && continue
        id=$(api GET "/projects/$SENTRY_ORG/$slug/" | jq -r .id)
        args+=(--data-urlencode "project=$id")
      done
    fi
    api GET "/organizations/$SENTRY_ORG/issues/" "${args[@]}" | jq \
      --argjson minEvents "$min_events" --argjson minUsers "$min_users" --argjson limit "$limit" '
      [ .[]
        | select((.count | tonumber) >= $minEvents and (.userCount // 0) >= $minUsers)
        | { id, shortId, title, culprit, level, status, project: .project.slug,
            count: (.count | tonumber), userCount, firstSeen, lastSeen, permalink } ]
      | .[:$limit]'
    ;;
  event)
    issue="${1:?issue id required}" event="${2:-latest}"
    api GET "/organizations/$SENTRY_ORG/issues/$issue/events/$event/" | jq '
      { eventId, dateCreated, release: (.release | if type == "object" then .version else . end),
        environment: ([.tags[]? | select(.key == "environment") | .value] | first),
        tags: [.tags[]? | select(.key | test("^(user|ip|email)"; "i") | not) | {key, value}],
        exceptions: [ .entries[]? | select(.type == "exception") | .data.values[]?
          | { type, value,
              frames: [ .stacktrace.frames[]? | select(.inApp == true)
                | { filename, module, function, lineNo } ] | .[-15:] } ] }'
    ;;
  resolve)
    issue="${1:?issue id required}" status="${2:-resolved}"
    case "$status" in resolved|resolvedInNextRelease) ;; *) echo "invalid status: $status" >&2; exit 2 ;; esac
    curl -fsS -X PUT "$base/organizations/$SENTRY_ORG/issues/$issue/" \
      -H @<(printf 'Authorization: Bearer %s\n' "$SENTRY_AUTH_TOKEN") \
      -H 'Content-Type: application/json' \
      --data "$(jq -nc --arg s "$status" '{status: $s}')" | jq '{id, shortId, status}'
    ;;
  -h|--help|"") sed -n '2,13p' "$0" ;;
  *) echo "unknown command: $cmd" >&2; exit 2 ;;
esac
