<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Branch-merge DB migration 047

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-conversation-branching
**Tags:** branch-merge

**Summary:** Forward migration `047_conversation_merge.ts` adds the branch-merge schema — `branch_merges`, the `branch_merge_sources` parentage join, the `messages.merge_id` backref and their indexes — then regenerates the typed schema artifacts.
**Context:** Branch-merge design §4 (Database): DDL mirrors the Kysely builder style of `013_chat_branches.ts` / `038_mesh_outbox.ts` with one ADD/DROP COLUMN per `alterTable` (`src/db/migrations/014_chats_active_branch.ts` header precedent); mode/status enum CHECKs follow `ck_mesh_outbox_status` (`src/db/migrations/038_mesh_outbox.ts:29`); the partial-unique idempotency index needs a raw `sql` fragment (the `ref(col)` form is unavailable in the installed Kysely); append-only policy + post-landing sync commands from `src/db/migrations/README.md`.
**Acceptance Criteria:** Schema lands as designed (constraints, composite PK, indexes, loss-tolerant down), typed artifacts regenerated, migration + roundtrip tests green.
**Related:** FEAT-046.md, FEAT-047.md, FEAT-message-swipe-replay-branch.md

## Summary

Create `src/db/migrations/047_conversation_merge.ts` (append-only policy — repo head is `046_mesh_outbox_chat_id.ts`):

- `branch_merges`: `id` text PK; `chat_id` FK→`chats.id` ON DELETE CASCADE; `base_message_id` FK→`messages.id` NOT NULL (the LCA); `mode` text NOT NULL + CHECK in (`combined`, `second-over-first`, `first-over-second`, `fresh-discovery`, `single-plus-glean`); `status` text NOT NULL default `draft` + CHECK in (`draft`, `confirmed`, `discarded`); `result_message_id` FK→`messages.id` SET NULL; `merged_branch_id` FK→`chat_branches.id` SET NULL; `created_by` FK→`users.id` NOT NULL; `idempotency_key` text nullable; `metadata` text (JSON: preview digest, hunks, token estimates, truncation flags); `created_at` default `datetime('now')`; `confirmed_at` nullable.
- `branch_merge_sources`: `merge_id` FK→`branch_merges.id` NOT NULL CASCADE; `ordinal` integer NOT NULL (0 = first, 1 = second); `branch_id` nullable FK→`chat_branches.id` SET NULL (a bare swipe tip has no branch row); `tip_message_id` FK→`messages.id` NOT NULL; composite PK `(merge_id, ordinal)` via `addPrimaryKeyConstraint`.
- `messages.merge_id`: one ADD COLUMN, nullable FK→`branch_merges.id` SET NULL (single-parent tree unchanged).
- Indexes: `idx_branch_merges_chat` `(chat_id, created_at)`; `uq_branch_merges_idem` UNIQUE `(chat_id, idempotency_key)` WHERE `idempotency_key IS NOT NULL` (partial unique — raw `sql` where-clause); `uq_branch_merge_sources_tip` UNIQUE `(merge_id, tip_message_id)`; `idx_messages_merge` `(merge_id)`.
- `down()`: drop `idx_messages_merge`, drop `messages.merge_id`, drop `uq_branch_merge_sources_tip` + `uq_branch_merges_idem` + `idx_branch_merges_chat`, drop `branch_merge_sources`, drop `branch_merges` — loss-tolerant: confirmed merges keep their message rows and synthetic branch rows as plain data.

After landing (per `src/db/migrations/README.md`): `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check`, then `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`.

Consumed by `TASK-branch-merge-service-and-criteria-engine.md`.

## Acceptance Criteria

- [ ] `047_conversation_merge.ts` creates `branch_merges` with the mode/status CHECK constraints and `branch_merge_sources` with the composite PK
- [ ] `messages.merge_id` added in a single-column `alterTable`; every index created, including the partial-unique `uq_branch_merges_idem`
- [ ] `down()` drops indexes → column → tables in order; confirmed-merge rows survive as plain data
- [ ] `bun run db:sync-types`, `bun run db:sync-manifest` regenerated and `bun run schemas:check` green
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts` passes
