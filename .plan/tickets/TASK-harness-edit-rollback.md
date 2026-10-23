<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness edit rollback (rollback -N / <op_id>)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-integration
**Depends on:** `TASK-harness-edit-journal`, `TASK-harness-lean-ctx-tools`
**Related:** TASK-harness-tool-sandbox.md, TASK-harness-exec-log.md, epic-recursive-self-improvement.md

**Summary:**

An agent-callable `rollback` tool: `rollback -1` (or `-2`, …) rolls back the Nth-most-recent edit, `rollback <op_id>` rolls back a specific journaled change. Restores the pre-edit content by re-applying the inverse anchored op, refusing — never force-writing — when the current file no longer matches the recorded anchor.

**Context:**

Today a bad edit (wrong file, failed tooling call mid-sequence, clobbered file) is recoverable only by re-reading and hand-patching, or by constructing a fresh worktree from a commit. The journal from `TASK-harness-edit-journal` already records, per op, `anchors_before` / `anchors_after` — the exact data needed to invert. The anchored-op seam (`TASK-harness-lean-ctx-tools`) is the single write path, so the inverse goes through the same seam: one write path, one rollback path, no second file-mutation API. Note the epic §5 rejection "checkpoint/rewind pair" refers to the *context-level* omp pair; this ticket is a file-state journal + inverse, a different artifact, and it is why that line is scoped rather than deleted.

**Acceptance Criteria:**

- [ ] `rollback -N` resolves the Nth-most-recent *successful* edit record in `.harness/edits.jsonl`; `rollback <op_id>` resolves by exact id; N out of range or unknown id returns an actionable error and writes nothing
- [ ] Before writing, the current file content hash is compared against that record's `anchors_after`; on mismatch (file changed since) rollback **refuses** with the drift reported (path, expected vs actual hash, op id) — never a blind overwrite
- [ ] Inverse op per journaled op kind: replace → write back `anchors_before` content; patch → re-apply the recorded hunk with anchors_before; delete → remove the created file; create → remove it (content preserved in the record for audit)
- [ ] Rollback itself goes through the anchored-op seam and appends its own journal record (`op: rollback`), so a rollback is itself rollback-able (`-1` undoes the rollback when no edit intervened)
- [ ] Role-gated like other harness tools (`gatePluginToolsByRole` pattern); secret-bearing paths are not special-cased in v1 — the same authz as the underlying write applies
- [ ] Test (parallel-safe; each test owns one unique tmp dir via the runner tmp facility — no fixed-path fixtures, no globals): journal + files per case, released in `afterEach`/`finally`; covers replace/patch/delete/create, drifted-anchor refusal (asserts no write: bytes + mtime unchanged), unknown id, and `-N` after a prior rollback — every rollback restores byte-identical pre-edit content
- [ ] `bun run check` green

## Technical Notes

- The hash check is what makes this safe to hand an agent: an anchored op either verifies or refuses; it never guesses. Failure mode is "refuse and report", matching the seam's existing no-force-write contract.
- Chain semantics stay flat: one record per artifact, inverse applies to the single recorded op — no multi-op transaction rollback (git remains the answer for cross-file atomicity).
- Depends on the seam from `TASK-harness-lean-ctx-tools`; sandbox hardening (vm/worker isolation) is `TASK-harness-tool-sandbox` and out of scope here.
- Resource contract (parallel-safe tests, per project rule): each test owns one unique tmp dir holding its journal + fixture files, released in `afterEach`/`finally`; no ordering assumption between cases — each builds its own journal.


git issue: 6f09e86
