<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: memory_embeddings rows are orphaned on actor/memory deletion

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-db-growth-tiered-storage
**Tags:** database, storage, integrity, embeddings

**Summary:** `memory_embeddings.memory_id` has no foreign key to `actor_memories`, and the only delete helper is called from tests - deleting an actor or a memory leaves 1536-dimension vector blobs in the DB forever.
**Context:** Found while reviewing the tiered-storage epic's "embedding pruning" phase. This is the concrete leak that phase is meant to prevent, and it is already present without any growth pressure.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Evidence

- `src/db/migrations/001_init.ts:3086-3093` - `memory_embeddings` is created with `memory_id` as a bare `primaryKey()`. No `.references("actor_memories.id")`, no `ON DELETE CASCADE`. Its sibling `actor_memories` does carry a FK (`:3062`), so the omission is asymmetric.
- `deleteEmbedding()` at `src/memory/embeddings.ts:93` deletes by `memory_id`, but its only call site in the tree is `src/memory/embeddings.test.ts:298`. No production deletion path invokes it.
- `memory_embeddings` is the densest table by design: `vector_blob` at `dimensions` defaulting to 1536.

Consequence: every deleted memory, and every memory deleted transitively with its actor, leaves its vector row behind, growing the file with rows nothing will ever read. The retention ticket's acceptance criterion "no orphans after actor/world deletion" is currently unreachable.

## Fix Shape

Two options; pick one and record why in this ticket:

1. **Forward migration** adding the FK + `ON DELETE CASCADE` from `memory_embeddings.memory_id` to `actor_memories.id`. SQLite cannot add a foreign key with `ALTER TABLE`, so this is a table rebuild - and the append-only policy (`src/db/migrations/README.md`) means a new top-level `NNN_*.ts`, never an edit to a shipped one.
2. **Delete hook** - call `deleteEmbedding` from the production memory/actor deletion path.

Option 1 is the root-cause fix (the schema stops permitting orphans). Option 2 alone leaves the schema able to re-introduce them.

## Acceptance Criteria

- [ ] Deleting a memory removes its `memory_embeddings` row.
- [ ] Deleting an actor removes embeddings for all of that actor's memories.
- [ ] Regression test asserting zero orphan rows after both operations.
- [ ] `bun run check` green; `bun test src/memory/` green.

## Related

- `TASK-embedding-and-telemetry-retention-policies.md` (the retention phase that depends on this)
- `epic-db-growth-tiered-storage.md`


git issue: fc8d36e
