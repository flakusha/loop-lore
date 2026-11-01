<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Capability grant model on chat branches

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-harness-rsi-repo-access
**Tags:** rsi, capability-grants, db
**Depends on:** `TASK-scoped-credential-model-and-api-key-table`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Spawn-time capability grants persisted on chat_branches, consumed at the agent API boundary. This task ABSORBS TASK-harness-delegated-permission-grants (amendment A4 — one owner for the chat_branches migration; no second epic may migrate it independently); effort re-labeled Medium-High. Vocabulary: repo:write, worktree:spawn, check:run, commit:signed, finalize:merge, ticket:ops — repo:read PRUNED (amendment A7: implied by worktree access). The vocabulary lives as a typed constants module consumed by validation + enforcement (amendment A11; HARNESS_TIERS runtime-list precedent, src/config/schema/harness.ts:11-12).
AC: grant columns arrive via ONE new migration (one ALTER per statement, banned-patterns.md:143-145); db:sync-types, db:sync-manifest, and schemas:check gates all pass.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Grant columns arrive via ONE new migration (one ALTER per statement)
- [ ] db:sync-types, db:sync-manifest, and schemas:check gates all pass
