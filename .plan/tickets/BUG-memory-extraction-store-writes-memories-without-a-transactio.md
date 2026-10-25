<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Memory extraction store writes memories without a transaction and never purges

**Status:** Done
**Priority:** Medium
**Resolved:** LIVE confirmed on tip — repro (trigger RAISE(ABORT) on the second memory insert) left 1 partial memory committed; storeMemories now wraps the dedup loop + recordAuditLog in one db.transaction() with all statements on trx (src/memory/extraction-store.ts:53-137). Sub-claim correction: recordAuditLog never throws (audit.ts:139-140 "Errors are logged but never thrown"), so the audit-failure leg cannot abort anything — the transaction closes the crash-mid-loop window and the insert-failure leg. Never-purges sub-claim already stale (cron/jobs.ts callers). 26/26 extraction tests + 21 audit tests green, gates green 2026-10-25, branch fix/bug-sweep.
**Effort:** Medium
**Epic:** epic-aux-enrichment-pipeline

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

**Resolved:** 2026-10-25 registry-driven close: git issue b3249b1 (registry tip: 72271e3b6 Konstantin Fedotov Close issue)
