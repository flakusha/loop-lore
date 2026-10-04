<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness eval harness (ground-truth task suites)

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Pass/fail agent-task suites with ground truth so every assistant/workflow change ships measured. Ranked gap #1: without it multi-agent work scales blind.
**Context:** `tests/benchmarks/` is crypto-only (`blake3.bench.ts` + `zstd.bench.ts`); agent-eval grep (eval harness|ground truth|task benchmark|agent score over tests/scripts/src/assistant) is zero hits. opencode `stats/` Firehose+Athena is the closest dashboard pattern; SWE-bench `instance/model/config/trial_results` is the log shape (live/recursive here, not static dataset).
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Task-suite runner: fixed task set with ground-truth outputs, pass/fail per task, deterministic seed; runs via `bun` alongside `tests/benchmarks/` (new subdir, no framework).
- [ ] Results append to `.harness/executions.jsonl` (same schema) so eval runs and live runs share queries.
- [ ] CI gate (advisory first): eval delta reported on assistant/workflow diffs; promote to blocking after false-positive measurement.
- [ ] RSI N-version patch arena (epic-recursive-self-improvement.md) consumes these suites — cross-link, no duplicate runner.

## Related Files

- `tests/benchmarks/` (new subdir), `.harness/executions.jsonl` (TASK-harness-exec-log)
- `epic-recursive-self-improvement.md`, `epic-core-testing-frameworks.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 9e6932e
