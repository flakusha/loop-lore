<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Player Agency & Story Points Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Borrow from tabletop RPG meta-currencies (Bennies / Fate Points / Inspiration): a player-earned meta-currency spent to invoke narrative control (retcon a roll, prompt a clarification, force a plot twist). Implemented as actor `properties.storyPoints`.

## Scope

- Awarded on milestones: quest completion, character milestone, GM-endorsed creativity.
- Spent on: roll re-roll, NPC attitude shift, plot injection, scene escape.
- One active pool per actor per chat; resets on chat restart.

## Technical Design

- **Data model:** `actor.properties.storyPoints` integer counter.
- **Service:** integration-registry (`src/rpg/integration-registry/`) tracks RPG subsystems and their edges; agency rules plug in here.
- **Rules engine:** `src/rpg/integration-registry/edges/` defines narrative-flow rules; agency spends route through this layer.
- **UI surface:** chat composer exposes a `/agency` slash command (planned).

<!-- GAP: dedicated `story_points` DB table + ledger of spends is aspirational; current state is actor property only. -->

## Integration Points

- `src/rpg/integration-registry/` — RPG subsystem edge registry
- `src/rpg/integration-registry/edges/` — narrative-flow rules
- `src/rpg/xp/sources.ts` — story point awards on milestone
- `src/story/quest-engine/` — quest-driven awards

## Related Epics

- `.plan/epics/epic-agency-story-points.md`
- `.plan/epics/epic-rpg-patterns.md`
