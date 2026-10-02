<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness exec log (JSONL run records)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Append-only `.harness/executions.jsonl` run log (zero-dep, grep+jq queried) as the RSI failure-mining feed. No query service until volume demands it.
**Context:** No dedicated harness execution log exists. Neighbors: agent ledger `.ledger.jsonl` (CLI-scope only), anonymized `telemetry_events` (not per-task-actionable). External shapes: OTel spans (gap: collector infra), SWE-bench logs (gap: static dataset), LangSmith traces (gap: SaaS) — JSONL is local + repo-anchored.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Schema per run: `run_id|ts|run_ms|task|task_type|model|tools[]|tool_count|pattern|pattern_detail|result|error|tooling_gap|cost_usd|tokens_in/out|branch|pid|git_sha|msg`; mirrors ledger `v/ts/pid/cmd/branch/msg`.
- [ ] Storage `<repo-root>/.harness/executions.jsonl`, gitignored; best-effort append on completion (success or failure), never blocks the run; no rotation (cron later).
- [ ] Documented `grep`+`jq` queries: failure rate per pattern, tooling gaps, cost per task type, top tools on failures, avg duration per type.
- [ ] RSI weekly failure-cluster mining (epic-recursive-self-improvement.md) reads this file — cross-link, no duplicate schema.

## Related Files

- `.harness/` (new, gitignored), `scripts/worktree/utils/ledger.ts` (shape precedent)
- `epic-recursive-self-improvement.md` (consumer)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
