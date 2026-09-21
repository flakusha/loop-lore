<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Quests, Random Encounters & Faction Structure

> **Status:** Partially implemented — the quest system shipped (consolidated engine + REST surface); random encounter tables/generation and faction structure are design-only. Authoritative source is `src/` and AGENTS.md.

## Implemented (quests)

- Engine: single consolidated `QuestEngine` (`src/story/quest-engine/`, consolidation commit `51a7bc01`); progress calculators `PROGRESS_CALCULATORS` (`src/story/quests/registry.ts`); `QuestConfig` union (`src/story/quest-types.ts`); `QuestType` enum (`src/db/enums-story/quests.ts`).
- Tables: `quests`, `quest_progress` (`src/db/schema-story.ts`).
- Routes: `src/routes/quests/` — per-world list/create, quest CRUD, progress endpoints (tests exercise `/api/worlds/:worldId/quests`, `/api/quests/:id`, `.../progress`); the epic records mounting at `/api/rpg/quests`.
- Frontend: `src/views/quests.html`, `src/frontend/pages/quests.ts`.
- World-state triggers flow through `src/story/events/`.

## Not implemented / aspirational

- **Axis-2 `category`** (`main|side|bounty|daily`) has no backend column; the create form sends it as `type`, causing the create-form 422 (TASK-harmonize-quest-type-taxonomy).
- Random encounter system (encounter tables, generation, location defaults) — no code.
- Faction structure (factions, members, hero/villain roles, inter-faction relations) — no tables or service; only design edges in `src/rpg/integration-registry/`.

## Unique content (compressed)

- Quest type axis (canonical, drives progress calculation): time, collection, destruction, rescue, discovery, social, composite.
- Narrative category axis (proposed): main, side, bounty, daily.

## Epics

- `.plan/epics/epic-quests-encounters.md` (🟡 implementation exists; type-taxonomy harmonization pending)
- `.plan/epics/epic-faction-reputation.md` (Not Started)
- `.plan/epics/epic-world-locations.md`
- `.plan/epics/epic-battle-action-systems.md`
