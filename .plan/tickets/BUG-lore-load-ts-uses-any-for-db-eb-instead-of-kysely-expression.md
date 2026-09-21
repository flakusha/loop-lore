<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: lore-load.ts uses any for db + eb instead of Kysely+ExpressionBuilder

**Status:** ✅ Closed (resolved in `0da9d9b0` — `fix(assistant): wire last_verified producer + drop dead decay gate`)
**Priority:** medium
**Effort:** Small
**Epic:** epic-lore-knowledge
**Summary:** `lore-load.ts` declared `ctx.db: any` and `(eb: any,)` in the WHERE callback. Violates `banned-patterns.md` (`any` prohibited) and `route-ctx-typing` skill.
**Context:** Extracted from `lore.ts` in `TASK-world-lore-lifecycle-confidence-decay-distortion`; sibling `lore-identity.ts` uses `Kysely<DB>` + `ExpressionBuilder<DB, …>`. The minimal ctx shape was a short cut during the size-strict split.
**Acceptance Criteria:** `lore-load.ts` contains no `any` keyword; `loadLore` accepts a typed `LoadLoreCtx`; `eb` callback typed as `ExpressionBuilder<DB, "actor_lore_entries" | "world_lore_entries">`; all tests pass.

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

## Resolution

Resolved in commit `0da9d9b0` on branch `lore-lifecycle-followup`. `loadLore` now
takes a typed `LoadLoreCtx` shape with `db: Kysely<DB>` plus the minimal
`chat`/`actor` fields it reads. The `eb` callback is typed as
`ExpressionBuilder<DB, "actor_lore_entries" | "world_lore_entries">`, matching
the pattern in the sibling `lore-identity.ts`. `any` removed entirely from this
file. All 161 lore + lifecycle tests pass; diff-scoped coverage gate green.
