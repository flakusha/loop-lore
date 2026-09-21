<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: lore-load.ts uses any for db + eb instead of Kysely+ExpressionBuilder

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-lore-knowledge

## Summary

`src/assistant/prompt/sections/lore-load.ts` declares `ctx.db: any` and `(eb: any,)` in the WHERE callback. Violates `.agents/references/banned-patterns.md` (`any` prohibited) and the `route-ctx-typing` skill (use `AssembleContext`, `Kysely<DB>`, `ExpressionBuilder<DB, …>`).

## Context

Extracted from `lore.ts` in `TASK-world-lore-lifecycle-confidence-decay-distortion` (merged `190a6ea9b`). Sibling `lore-identity.ts` uses `Kysely<DB>` for the db handle and `ExpressionBuilder<DB, …>` for the where callback. The minimal ctx shape in `lore-load.ts` was a short cut during the size-strict split.

## Acceptance Criteria

- [ ] `lore-load.ts` no longer contains `any` keyword
- [ ] `loadLore` accepts `AssembleContext` (or typed subset: `{ db: Kysely<DB>; chat: Chat; actor: Actor }`)
- [ ] `eb` callback typed as `ExpressionBuilder<DB, "actor_lore_entries">` (and `… "world_lore_entries"` for the second query)
- [ ] All 16 `lore.test.ts` + 25 `lifecycle.test.ts` assertions pass
- [ ] `bun run check --diff-base dev` passes
