<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Memory extraction store writes memories without a transaction and never purges

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

storeMemories inserts each memory independently and only writes audit rows after the whole loop succeeds, so a crash or throw mid-loop leaves inserted memories with no audit trail. Separately, purgeStaleMemories and applyDecay exist and are tested but no production caller invokes them, so actor_memories grows without bound.

Evidence read on dev:

- src/memory/extraction-store.ts:68-119 — for-loop with one await db.insertInto('actor_memories').execute() per memory; no db.transaction().
- src/memory/extraction-store.ts:122-125 — recordAuditLog runs only after the loop, outside any transaction.
- src/memory/extraction.ts:116-133 — extractAndStoreMemories calls extractMemories then storeMemories; no purge or decay call.
- src/memory/purge.ts — purgeStaleMemories and applyDecay are defined and tested with zero production callers.

Source: .tmp/longcat/review-consolidated.md nit 13; .tmp/longcat/review-assets-db-frontend.md N1, N29, N30; .tmp/cat-jam/review-memory-assets-rag.md P2 (extracted memories default to privacy 'shared').

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
