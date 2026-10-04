<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt plan gates report ~112 phantom actionable issues when the git issue CLI is unreachable

**Summary:** giwt plan gates emit ~112 phantom actionable issues when the git issue CLI is unreachable
**Context:** giwt (upstream, bundled `readGitIssues`) shells out to `git issue ls --all --format oneline` with a hard 10s budget; on failure it reports "git issue CLI unavailable" yet still dumps every unseen issue as an actionable finding and exits 1, turning a green tree red in `bun run check`
**Acceptance Criteria:** `bun run check` on a host where `git issue` is unreachable or slower than 10s reports the plan gates as skipped with a reason, not as a failing gate carrying 112 invented findings

**Status:** Done
**Priority:** high
**Effort:** Medium

## Summary

**What**: `giwt plan validate` / `giwt sync` shell out to `git issue ls --all --format oneline` with a hard 10s budget (bundled `readGitIssues`, `timeout: 1e4`). When that call fails, giwt reports `Git issues: 0 (git issue CLI unavailable)` and then lists every issue it could not see as an actionable finding - 112 phantom findings on this repo - and exits 1. The check runner therefore goes red on a green tree.

**Measured on loop-lore (2026-09-26)**:
- `git issue ls --all --format oneline` (3166 issues): 5.4s idle, 15.5s with the 32 cores busy - the 10s budget is marginal by design and trips under any check-runner load.
- Inside a full `bun run check`, a PATH shim on `git` shows the call failing in 3ms with `git: 'issue' is not a git command` (`git-issue` lives in ~/.local/bin and is not always resolvable from the gate's environment) - so a fast hard failure is the common case, not the timeout.
- Same commands exit 0 when the CLI resolves (`bun run check:parallel --gates 'plan - validate,plan - ticket index (sync)'` passes; the identical 25-gate light pool passes 25/25).

**Why it matters**: a red gate with 112 invented findings invites an agent to 'fix' drift that does not exist, or to burn a run bisecting an environment problem.

**Upstream fixes wanted**:
1. Unavailable CLI must be a distinct 'cannot evaluate' outcome - no findings, distinct exit code - not a findings dump.
2. Scale or remove the fixed 10s budget (it does not grow with issue count).
3. Resolve the issue CLI by absolute path / git exec-path instead of bare PATH lookup.

**In-repo mitigation meanwhile**: `scripts/check-parallel.mjs` now reports these gates as SKIP with the reason (summary.skipped, per-check skipped flag) instead of FAIL.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification Notes (2026-10-01)

Re-verified against current `dev`; the defect described in this ticket is
already fixed. The ticket was left open past the fix.

Evidence: `scripts/check-parallel.mjs:812,1012`

- A gate whose output contains `GIWT_ISSUE_CLI_UNAVAILABLE` is recorded as `skipped` rather than failed, and `summary.skipped` counts it, so the phantom findings are no longer reported as actionable red gates.
