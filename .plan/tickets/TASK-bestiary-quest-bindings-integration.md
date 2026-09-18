<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary Quest Bindings Integration

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, quests


Bestiary: Bestiary Quest Bindings Integration


- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Summary:**
Hook bestiary species into the quest system so species entries are first-class quest targets.

**Context:**
Existing quest code references characters/locations as targets. The world-RPG epic batch wants bestiary species (population counts at a location) to be valid quest objectives ("thin the wolf pack", "harvest the mooncap fungus").

**Acceptance Criteria:**
- `BestiaryEntry.questIds` array; quest system now accepts `targetType = "species"` in addition to `character | location`.
- Quest objective completion: `LocationPopulation.count` falls below threshold (kills) or rises above threshold (cultivation).
- `TASK-quests-encounters` integration: when bestiary reputation event fires, emit quest-update side-effect.
- Tests: create species, attach as quest target, complete quest via count change.
