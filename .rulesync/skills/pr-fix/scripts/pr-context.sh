#!/usr/bin/env bash
# Load a compact JSON snapshot of a GitHub pull request in one GraphQL call:
# metadata, failing checks, reviews, issue comments and unresolved review threads.
#
# Usage: pr-context.sh [pr-number|pr-url] [--since <ISO-8601>] [--all-threads]
#   no PR argument   -> PR of the current branch
#   --since          -> only reviews/comments/threads with activity after the UTC timestamp
#                       (YYYY-MM-DDTHH:MM:SSZ, e.g. a previous loadedAt)
#   --all-threads    -> include resolved threads (default: unresolved only)
#
# Requires: gh (authenticated). Output keys: loadedAt, viewer, pr, checks,
# reviews, comments, threads, resolvedThreads, truncated.
set -euo pipefail

pr="" since="" all_threads=false
while [ $# -gt 0 ]; do
  case "$1" in
    --since) since="${2:?--since requires a value}"; shift 2 ;;
    --all-threads) all_threads=true; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) pr="$1"; shift ;;
  esac
done

if [ -n "$since" ] && ! [[ "$since" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  echo "invalid --since timestamp (expected UTC YYYY-MM-DDTHH:MM:SSZ): $since" >&2
  exit 2
fi

url=$(gh pr view ${pr:+"$pr"} --json url --jq .url)
if ! [[ "$url" =~ ^https://[^/]+/([^/]+)/([^/]+)/pull/([0-9]+)$ ]]; then
  echo "could not resolve pull request URL: $url" >&2
  exit 1
fi
owner="${BASH_REMATCH[1]}" repo="${BASH_REMATCH[2]}" number="${BASH_REMATCH[3]}"

read -r -d '' query <<'GRAPHQL' || true
query($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number url title body state isDraft reviewDecision
      baseRefName headRefName headRefOid
      author { login __typename }
      commits(last: 1) {
        totalCount
        nodes { commit { statusCheckRollup { state contexts(first: 100) { pageInfo { hasNextPage } nodes {
          __typename
          ... on CheckRun { name status conclusion detailsUrl }
          ... on StatusContext { context state targetUrl }
        } } } } }
      }
      reviews(last: 50) {
        pageInfo { hasPreviousPage }
        nodes { databaseId state body submittedAt authorAssociation author { login __typename } commit { oid } }
      }
      comments(last: 100) {
        pageInfo { hasPreviousPage }
        nodes { databaseId body createdAt authorAssociation author { login __typename } }
      }
      reviewThreads(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          isResolved isOutdated path line startLine
          comments(first: 50) { nodes { databaseId body createdAt authorAssociation author { login __typename } } }
        }
      }
    }
  }
}
GRAPHQL

# shellcheck disable=SC2016
jq_filter='
def who: {login: (.author.login // "ghost"), type: (if (.author.__typename // "") == "Bot" or ((.author.login // "") | endswith("[bot]")) then "bot" else "user" end), association: .authorAssociation};
def recent(ts): if $since == "" then true else (ts // "") > $since end;
.data as $d | $d.repository.pullRequest as $p |
($p.reviewThreads.nodes | map(select(.isResolved | not))) as $open |
{
  loadedAt: (now | todate),
  viewer: $d.viewer.login,
  pr: {number: $p.number, url: $p.url, title: $p.title, body: $p.body, state: $p.state, isDraft: $p.isDraft,
       reviewDecision: $p.reviewDecision, author: $p.author.login, base: $p.baseRefName, head: $p.headRefName,
       headSha: $p.headRefOid, commitCount: $p.commits.totalCount},
  checks: {
    state: ($p.commits.nodes[0].commit.statusCheckRollup.state // "NONE"),
    failing: [($p.commits.nodes[0].commit.statusCheckRollup.contexts.nodes // [])[]
      | {name: (.name // .context), result: (.conclusion // .state), url: (.detailsUrl // .targetUrl)}
      | select(.result as $r | ["FAILURE","ERROR","CANCELLED","TIMED_OUT","ACTION_REQUIRED","STARTUP_FAILURE"] | index($r))],
    pending: [($p.commits.nodes[0].commit.statusCheckRollup.contexts.nodes // [])[]
      | select((.status // "") != "" and .status != "COMPLETED" or (.state // "") == "PENDING") | (.name // .context)]
  },
  reviews: [$p.reviews.nodes[] | select(recent(.submittedAt)) | select(.body != "" or .state != "COMMENTED")
    | who + {id: .databaseId, state, body, submittedAt, commit: .commit.oid}],
  comments: [$p.comments.nodes[] | select(recent(.createdAt)) | who + {id: .databaseId, body, createdAt}],
  threads: [(if $all then $p.reviewThreads.nodes else $open end)[]
    | select(any(.comments.nodes[]; recent(.createdAt)))
    | {resolved: .isResolved, outdated: .isOutdated, path, line, startLine, replyToId: .comments.nodes[0].databaseId,
       comments: [.comments.nodes[] | who + {id: .databaseId, body, createdAt}]}],
  resolvedThreads: ([$p.reviewThreads.nodes[] | select(.isResolved)] | length),
  truncated: ($p.reviews.pageInfo.hasPreviousPage or $p.comments.pageInfo.hasPreviousPage or $p.reviewThreads.pageInfo.hasNextPage
    or ($p.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage // false))
}'

gh api graphql -f query="$query" -f owner="$owner" -f repo="$repo" -F number="$number" \
  | jq --arg since "$since" --argjson all "$all_threads" "$jq_filter"
