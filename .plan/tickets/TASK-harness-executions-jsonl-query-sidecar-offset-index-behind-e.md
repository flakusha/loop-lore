<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness: executions.jsonl query sidecar (offset index) behind existing exports

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Harness query-side scalability slice (HarnessReuse T16): the executions.jsonl query sidecar.

**Ground state:** `src/harness/exec-log.ts:26` (`HARNESS_LOG_FILENAME = "executions.jsonl"`, append JSONL); `src/harness/query.ts` tails at most 4MB and anticipates an offset index or SQLite mirror behind the same 3 exports (`:12-14`, `:72-74`); wire shape `src/harness/types-wire.ts:62-63` (snake_case `task`/`task_type`); TUI consumes harness REST via `src/tui/harness/api.ts` + overlay `src/tui/harness/` (contract `api-contract.test.ts:301-376`).

**Adopt/adapt/defer:** No external URL for this slice; the sidecar is the anticipated in-repo upgrade path (`query.ts` comments). SQLite mirror is an explicit DEFER (documented non-goal).

**Acceptance criteria:**

- [ ] `.harness/executions.idx` offset sidecar is written alongside the JSONL.
- [ ] The three `query.ts` exports keep their signatures; the tail is no longer capped at 4MB for indexed files.
- [ ] SQLite mirror stays a documented non-goal for this ticket.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
