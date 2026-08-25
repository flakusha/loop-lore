<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harmonize Quest Type Taxonomy

**Status:** ⬜ Todo
**Priority:** High
**Effort:** Medium
**Epic:** epic-quests-encounters

## Summary

The quests domain has TWO orthogonal classification axes that are currently
collapsed into a single `type` field, causing a validation gap:

- **Completion mechanic** (`QuestType`, canonical): `time | collection |
  destruction | rescue | discovery | social | composite` — defined in
  `src/db/enums-story/quests.ts`, wired into `PROGRESS_CALCULATORS`
  (`src/story/quests/registry.ts`) and the `QuestConfig` discriminated union
  (`src/story/quest-types.ts`). This is what the backend `quests.type` column
  and `QuestTypeSchema` (`src/validation/schemas/primitives.ts`) actually mean.
- **Narrative category** (`main | side | bounty | daily`): narrative weight +
  reset behavior. This is the taxonomy the create form offers
  (`src/views/quests.html` type `<select>`; `src/frontend/pages/quests.ts`
  `createType: "side"`), matching industry convention
  (`bevy_quests::QuestCategory`, Hytale/KyuubiSoft, WoW: Main/Side/Daily/Bounty).

Because the form sends a *category* value as `type`, `POST /api/worlds/:worldId/quests`
rejects it (`QuestCreateBody` validates `type` against the mechanic enum) → 422.
The P1 browser `quests-flow` test currently works around this by creating via the
API with a valid mechanic `type:"collection"`.

## Decision (harmonize)

Treat the two axes as SEPARATE fields:
- Keep `quests.type` = completion mechanic (the 7 canonical values). Do NOT
  expand or rename it — progress calculators and the `QuestConfig` union depend on it.
- Add a new `quests.category` column + `QuestCategory` enum
  (`main | side | bounty | daily`, extensible to `weekly | event | tutorial`)
  for narrative weight / reset behavior.
- The create form sends BOTH `type` (mechanic, required) and `category`
  (narrative, optional w/ default `side`).

## Acceptance Criteria

- [ ] `QuestCategory` enum added (`src/db/enums-story/quests.ts`) + migration adds `quests.category`
- [ ] `QuestTypeSchema` unchanged (mechanic); new `QuestCategorySchema` added
- [ ] `QuestCreateBody` / `QuestResponse` (`src/validation/schemas/story.ts`, `quests.ts`) accept `category`
- [ ] `quests-flow` e2e submits the REAL create form (both selects) and asserts persistence (no API workaround)
- [ ] `src/views/quests.html` + `src/frontend/pages/quests.ts`: replace single `type` select with `type` (mechanic) + `category` (narrative) selects; fix `createType` default
- [ ] DB schema regenerated (`bun run db:sync-types && bun run db:sync-manifest`) and `db:schemas:check` green
- [ ] `docs/spec/quests-encounters.md` reconciled with the two-axis model (if it asserts a single taxonomy)

## Linked Epics

- `epic-quests-encounters.md` (Quest Type Taxonomy section)

## Research

- In-repo: dual engines already consolidated (`TASK-consolidate-quest-engines`,
  `51a7bc01`); only the frontend taxonomy diverged.
- External: `bevy_quests::QuestCategory` = {Main, Side, Daily, Event, Challenge,
  Tutorial, Bounty, Guild}; Hytale/KyuubiSoft quest TYPES = {Daily, Weekly,
  Story, Side, Hub} with separate objective types (combat/gather/craft); MMORPG
  quest classification segregates by game element/mechanic (Kill/Collection/
  Delivery/Interaction/Escort) — i.e. mechanic vs narrative are universally
  separate axes.


git issue: 2918503
