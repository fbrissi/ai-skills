# Failures that pass locally

Check these when a step fails in CI but its command passes on a developer machine.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| A "check generated files" step wants to create many files | The outputs are gitignored, so a clean checkout lacks them, while local runs see them | Check only tracked outputs, for example by generating in a temporary copy and diffing tracked files |
| A parser counts 0 items although the log shows them | The tool colors output in CI (escape codes such as `\x1b[36m`), or changes its layout without a TTY | Strip ANSI codes, or set `NO_COLOR=1` / the tool's no-color flag |
| A test passes on the branch but fails on the PR | `pull_request` runs check out the merge commit (`refs/pull/<n>/merge`), which includes newer base changes | Rebase or merge the base and rerun locally |
| `Not Found` from the GitHub App token step, or `Resource not accessible by integration` | The GitHub App is not installed on the repository, or the token lacks a permission | Install the app on the repository, or add the permission to the workflow or app |
| Empty secret, `401`, or a skipped deploy step on PRs from forks | Secrets are not passed to `pull_request` runs from forks | Use a trusted trigger, or skip the step for forks |
| `workflow_dispatch` or `workflow_call` uses an old workflow file | Dispatched runs use the workflow from the ref they run on (often the default branch) | Merge the workflow change to that ref first, or dispatch on the PR's ref |
| Works with one runtime version, fails with another | The CI image or setup action resolves a different Node, Ruby, Python, or tool version | Pin the version in the workflow and the project |
| Script fails on Linux but not on macOS (or the reverse) | GNU vs BSD tools (`sed -i`, `date`, `readlink`), bash 3.2 vs 5 (empty arrays with `set -u`), case-sensitive paths | Use portable flags, or pin the shell and tools |
| Command waits forever or asks for input | An interactive prompt without a TTY | Pass the tool's non-interactive flag (`-y`, `--yes`, `CI=true`) |
| An aggregate "required" job fails with only `exit code 1` | A gate job that checks the result of other jobs | Report it under the root failure, not as a separate cause |
| `npm ci` / lockfile errors only in CI | The lockfile is stale or was produced by another package manager version | Regenerate the lockfile with the project's package manager |
| Check never ran on a draft PR | The workflow or job skips drafts | Mark the PR ready, or say the check is expected to be skipped |
