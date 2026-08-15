# Epic: Quests & Encounters

**Status:** 🟡 Implementation exists (single consolidated engine, wired under /api/rpg/quests); quest type-taxonomy harmonization pending (see TASK-harmonize-quest-type-taxonomy)
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** quests, encounters, missions, exploration, events

## Overview

Quests and encounters system specification — covers quest generation, encounter mechanics, mission tracking, and dynamic event systems. Supersedes quest sections in `docs/spec/worlds.md`.

## Reference

- Spec: `docs/spec/quests-encounters.md`
- Related: `docs/spec/worlds.md`, `docs/spec/npcs.md`

## Quest & Encounter Systems

### Core Quest Model

interface Quest {
  id: string;
  worldId: string;
  name: string;
  description: string | null;
  type: QuestType;         // Axis 1: completion mechanic (canonical, 7 values)
  category: QuestCategory; // Axis 2: narrative weight / reset behavior (main|side|bounty|daily)
  status: QuestStatus;
  progress: number;
  target: number;
  // ... objectives, rewards, deadlines
}
interface QuestObjective {
}
interface Encounter {
}
interface EncounterTrigger {
}
interface MissionTracker {
}

## Quest Type Taxonomy

Quests are classified along TWO orthogonal axes. Collapsing them into one `type`
field is the root cause of the current create-form 422 (tracked in
TASK-harmonize-quest-type-taxonomy).

### Axis 1 — Completion Mechanic (`type`, canonical)

Defined in `src/db/enums-story/quests.ts` (`QuestType`), validated by
`QuestTypeSchema` (`src/validation/schemas/primitives.ts`), and consumed by
`PROGRESS_CALCULATORS` (`src/story/quests/registry.ts`) + the `QuestConfig`
discriminated union (`src/story/quest-types.ts`). **This is the only axis the
backend `quests.type` column models.**

| Value         | Progress measured by                     |
|---------------|------------------------------------------|
| `time`        | in-game time elapsed                     |
| `collection`  | items / category gathered                |
| `destruction` | targets eliminated                       |
| `rescue`      | escort target to safe location           |
| `discovery`   | locations / secrets / lore revealed      |
| `social`      | disposition / interactions with an actor |
| `composite`   | sub-quests (`all` / `any` / `sequence`)  |

### Axis 2 — Narrative Category (`category`, proposed)

Narrative weight + reset behavior. The create form already offers these as the
`type` `<select>` (`src/views/quests.html`) and `createType` default
(`src/frontend/pages/quests.ts`): `main | side | bounty | daily`. This matches
industry convention — `bevy_quests::QuestCategory` {Main, Side, Daily, Event,
Challenge, Tutorial, Bounty, Guild}, Hytale/KyuubiSoft {Daily, Weekly, Story,
Side, Hub}, and WoW Main/Side/Bounty. **Currently has NO backend column.**

### Harmonization

Keep `type` = completion mechanic (do NOT rename/expand it — calculators and the
`QuestConfig` union depend on it). Add `category` = narrative role as a new
column + `QuestCategory` enum. The create form sends both. Full plan + acceptance
criteria in TASK-harmonize-quest-type-taxonomy.

## Acceptance Criteria

- [ ] Quest generation system implemented
- [ ] Encounter mechanics functional
- [ ] Mission tracking working
- [ ] Dynamic event system operational
- [ ] Quest **type taxonomy harmonized** — `type` = completion mechanic, `category` = narrative role (two separate fields; TASK-harmonize-quest-type-taxonomy)
- [ ] Create form submits both `type` + `category`; no 422 on submit

## Wiring & Resolution Plan

- **Consolidation**: DONE (`TASK-consolidate-quest-engines`, `TASK-wire-quests-routes`, commit `51a7bc01`). The dual engines (`src/rpg/quests` vs `src/story/quest-engine`) are merged into a single engine; `QuestService` is mounted under `/api/rpg/quests` via the WIRED-7 pattern.
- **Residual gap — quest type taxonomy**: the create form still emits the *narrative-role* taxonomy (`main|side|bounty|daily`) as `type`, while the backend `QuestType` enum is the *completion-mechanic* taxonomy (`time|collection|destruction|rescue|discovery|social|composite`). These are two orthogonal axes and must be separated into `type` + `category`. Tracked in `TASK-harmonize-quest-type-taxonomy`.
