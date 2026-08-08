# Epic: Quests & Encounters

**Status:** 🟡 Implementation exists (rpg/quests + story/quest-engine); DUAL-SYSTEM + unwired
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
}
interface QuestObjective {
}
interface Encounter {
}
interface EncounterTrigger {
}
interface MissionTracker {
}

## Acceptance Criteria

- [ ] Quest generation system implemented
- [ ] Encounter mechanics functional
- [ ] Mission tracking working
- [ ] Dynamic event system operational

## Wiring & Resolution Plan (2026-08-08 audit)

Quest implementation exists in TWO engines — `src/rpg/quests/` (`QuestService`, CRUD +
objectives + progression + rewards, backed by `quests` + `quest_progress`, migration 001/p07)
AND `src/story/quest-engine` — both writing the `quests` table (DUAL-SYSTEM). `QuestService` is
code-complete + tested but has ZERO external importers. Resolution: FIRST consolidate the dual
engines (`TASK-consolidate-quest-engines`), THEN mount `QuestService` under `/api/rpg/quests`
(`TASK-wire-quests-routes`) via the WIRED-7 mount pattern.
