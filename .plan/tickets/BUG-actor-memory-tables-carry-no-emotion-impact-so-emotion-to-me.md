<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Actor memory tables carry no emotion_impact, so emotion-to-memory integration has no persistence

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:**

Found while reconciling `.plan/epics/epic-memory-knowledge-systems.md`.

`ActorMemories` in `src/db/schema-story.ts:275-304` has no `emotion_impact` column, and no timeline or game-time fields. The epic's core integration criteria depend on remembering the emotional cause of a memory, not just its content.

The memory panel UI, lorebook cooldowns, and carry-memory all shipped; this persistence column is the gap that keeps the epic open.

Implementation: add `emotion_impact` (and the timeline/game-time fields the epic names) to `actor_memories` via a NEW forward migration — the chain is append-only, so do not edit `001_init.ts`. Per `src/db/migrations/README.md`, one ADD COLUMN per `alterTable` statement. Then regenerate `src/db/schema-*.ts` and `src/validation/db-schemas.ts` via `bun run db:sync-*`, and map the new column in `src/db/column-types.ts` if it is a text enum.

Also worth confirming in the same change: whether `emotion_impact` is read anywhere today. If nothing writes it, the column alone is inert and the writer has to land with it.

**Status of the column (verified 2026-10-23, assistant integration review):** the schema half of
this ticket is DONE — migration `069_actor_memories_emotion_impact.ts` added
`actor_memories.emotion_impact` (`schema-story.ts:304`). But the column has **zero
writers and zero readers repo-wide** (`emotionImpact` matches only generated files:
`schema-manifest.ts:1505`, migration 069, `insert-helpers.ts:3622`,
`db-schemas.ts:2548` — nothing in `src/memory/` or any route). The description above
("has no emotion_impact column") is stale.

**Decision needed:** wire-or-drop — either wire `emotion_impact` into `src/memory/`
extraction + `src/chat/context-window.ts:injectMemories` (weighting), or drop the
column before `epic-db-migration-compaction` touches it. Related design ticket:
`TASK-memory-emotion-impact.md` (structured `MemoryEmotionImpact`).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 9d6ac7f (registry tip: 9e4884193 Konstantin Fedotov Close issue)
