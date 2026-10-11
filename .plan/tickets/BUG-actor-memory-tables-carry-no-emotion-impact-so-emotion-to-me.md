<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Actor memory tables carry no emotion_impact, so emotion-to-memory integration has no persistence

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:**

Found while reconciling `.plan/epics/epic-memory-knowledge-systems.md`.

`ActorMemories` in `src/db/schema-story.ts:275-304` has no `emotion_impact` column, and no timeline or game-time fields. The epic's core integration criteria depend on remembering the emotional cause of a memory, not just its content.

The memory panel UI, lorebook cooldowns, and carry-memory all shipped; this persistence column is the gap that keeps the epic open.

Implementation: add `emotion_impact` (and the timeline/game-time fields the epic names) to `actor_memories` via a NEW forward migration — the chain is append-only, so do not edit `001_init.ts`. Per `src/db/migrations/README.md`, one ADD COLUMN per `alterTable` statement. Then regenerate `src/db/schema-*.ts` and `src/validation/db-schemas.ts` via `bun run db:sync-*`, and map the new column in `src/db/column-types.ts` if it is a text enum.

Also worth confirming in the same change: whether `emotion_impact` is read anywhere today. If nothing writes it, the column alone is inert and the writer has to land with it.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
