<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness memory scope for exec log recall

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Add `harness` to `MemoryScope`, embed exec-log run summaries, and inject recalled memory at `dispatch.ts` turn start.

**Context:** `src/memory/types.ts:27` has no `harness` member. Required row `RELEASE-1.0.0.md:185` names memory for chats and harness; `.tmp/research/harness-parity/23-gap-reconciliation.md` #4 says no ticket was filed. Exec-log is landed; re-derive migration numbering at implementation time.

**Acceptance Criteria:**

- [ ] `harness` is a valid scope with ownership checks matching the other scopes.
- [ ] Run summaries are embedded and recalled at harness turn start.
- [ ] Tests cover scope isolation and no cross-chat leakage.
