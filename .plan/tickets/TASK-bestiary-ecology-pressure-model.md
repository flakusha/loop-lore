<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary Ecology Pressure Model

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, ecology, predator-prey


Bestiary: Bestiary Ecology Pressure Model


- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Summary:**
Predator-prey pressure model that nudges reproduction and migration across linked species.

**Context:**
Ecology balance is separate from raw repopulation: predators lag when prey are scarce; prey grows unchecked when predators are absent. This engine adjusts `ecologyPressure` per population row and influences repopulation cadence of dependent species.

**Acceptance Criteria:**
- `src/bestiary/ecology.ts` exports `computeEcologyPressures(worldId, db)`: for each `LocationPopulation`, derives `ecologyPressure` = f(count, predatorOf/preyOf lists from `BestiaryEntry.habitat`).
- Pressure in [-1, +1]; positive = prey overabundant (predators encouraged to spawn), negative = predator overabundant (prey encouraged).
- Pressure feeds into the repopulation engine as a multiplier on `probabilityPerTick`.
- Pure function over DB rows; tested with snapshot data.
- Threshold-based ecology events (imbalance > 0.8) emit cross-faction events consumed by `epic-faction-reputation` politics ticket.
