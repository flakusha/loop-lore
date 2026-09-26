<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — close 2026-09-25 epic-linkage advisory orphans + backfill metadata

**Status:** open
**Priority:** medium
**Effort:** Small
**Type:** Task
**Summary:** open-untriaged.md § 2026-09-25 epic linkage review applied high-confidence Epic: field attachments to 5 tickets, identified 9 source-already-declares-an-epic rows that need index-regeneration, and listed 11 RPG opt-in / 5 workflow-GM routing / 7 mesh-federation items with explicit existing-epic homes. This ticket is the bookkeeping pass that closes the 2 hold-or-close rows (e12566a idempotency, dd6158e TASK-unified placeholder, c667507 ticket-epic-link backfill) and confirms the index reflects all attachments after a plan:sync:fix run.
**Context:** Per the 2026-09-25 review, the index metadata is intentionally not bulk-linked. Five source files now carry the correct Epic: field (assistant-lorebook-tools, browser test fixtures, capability-disclosure, regex-pipeline-hardening, conversation-branching). The current plan:sync:fix updates status links but does not backfill body-level Epic: fields; a fresh index regeneration is required after the source-level edits land.

## Steps

1. Close e12566a (idempotency-table-backend — see BUG-idempotency-table-backend-verify-reproduces.md) and dd6158e (TASK-unified placeholder scope — close as not-an-initiative).
2. Verify each ticket file listed in § "Source already declares an epic" carries the correct **Epic:** field with a real epic name.
3. Run bun run plan:sync:fix after the source edits to confirm the index reflects the body-level fields without hand-editing index.json directly (the index is generated; per the review's explicit instruction).
4. Confirm the 11 RPG opt-in, 5 workflow/GM routing, and 7 mesh/federation items each carry the correct existing-epic pointer (no duplicate epics created).

**Acceptance Criteria:**

- [ ] e12566a, dd6158e, c667507 closed (or pointer tickets created if scope emerges from closure evidence).
- [ ] The five high-confidence epic attachments are visible in index.json after plan:sync:fix regenerates it.
- [ ] No new epic files are created for items that already have an explicit epic home.
- [ ] bun run plan:sync reports zero orphans for the 2026-09-25 review set.

**Tags:** plan-sync, untriaged, advisory-orphan, epic-linkage, bookkeeping
**Related:** .plan/backlog/open-untriaged.md § 2026-09-25, scripts/plan/sync.ts, .plan/tickets/index.json


git issue: c7448b3
