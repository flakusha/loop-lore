<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness edit journal (per-op patch records)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `epic-harness-integration`
**Depends on:** `TASK-harness-lean-ctx-tools`
**Related:** TASK-harness-exec-log.md, TASK-harness-edit-rollback.md, TASK-harness-otel-replay.md

**Summary:**

Append one JSONL record per file-mutating harness op (`.harness/edits.jsonl`, beside `executions.jsonl`), so every edit the agent makes is addressable after the fact: by run, by turn, by path, by op id. This is the storage half of rollback — no inverse semantics here.

**Context:**

`TASK-harness-lean-ctx-tools` routes all file/patch work through `ctx_patch`-shaped anchored ops (line+hash from read) — one seam, one identity per op. `TASK-harness-exec-log` records one row per *run* with `tools[]` but no per-*edit* detail: the agent ledger (`.ledger.jsonl`) is CLI-scope only, `telemetry_events` is anonymized and not per-op. Nothing today can answer "what did this run change in `src/routes/x.ts`, and what was there before". The anchored op already computes the before/after anchors; journaling them is a few lines, and it is the prerequisite for `TASK-harness-edit-rollback`.

**Acceptance Criteria:**

- [ ] One record per file-mutating op that passes through the anchored-op seam: `op_id` (blake3 over op+anchors), `run_id` + `turn_id` (join keys identical to `TASK-harness-exec-log`), `ts`, `path`, `op` (create/patch/replace/delete), `anchors_before` (line+hash) / `anchors_after` (line+hash), `result` (ok/error), `error` on failure, `pid`, `branch`, `git_sha`
- [ ] Read-only ops (read/grep/glob) do NOT append — the journal is edits only
- [ ] Storage `<repo-root>/.harness/edits.jsonl`, gitignored; append is best-effort and never fails the underlying op (a failed journal append logs once via the existing logger and continues); no rotation (deferred, noted in Technical Notes)
- [ ] Append happens on both success and failure paths of the op — a failed mutation attempt is journaled with `result: error` so tooling-call failures are recoverable
- [ ] Documented `grep`+`jq` queries: ops by run, ops by path (last N), all edits since a git sha, error-rate per op kind — same house style as the exec-log ticket's query list
- [ ] Test (parallel-safe; each test owns one unique tmp dir via the runner tmp facility — never the fixed `<repo-root>/.harness/` path): fixture session (create two files, patch one, delete one, one failed patch) replayed through the seam yields exactly five records with correct anchors; an unwritable journal dir still completes all four mutations
- [ ] Tests release their dir in `afterEach`/`finally` (failed tests included) and carry no ordering dependence — each case builds its own journal fixture
- [ ] `bun run check` green

## Technical Notes

- Reuses the exec-log precedent wholesale: same gitignore rule, same append-never-block rule, same grep+jq query style — no new storage pattern.
- Growth is unbounded by design for v1 (same as `executions.jsonl`); add rotation only when measured.
- `git_sha` per record makes the journal joinable with commits post-hoc; it is not a git replacement and never runs git.
- Resource contract (parallel-safe tests, per project rule): each test owns one unique tmp dir + unique file names via the runner tmp facility, released in `afterEach`/`finally`; the fixed `<repo-root>/.harness/` path is production-only, never a fixture.
