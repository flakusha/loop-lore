<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: src/rpg/ NIT 1-4 barrel/organization implementations

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-file-splitting.md
**Tags:** file-splitting

**Summary:** Implements NIT 2-4 from TASK-src-rpg-module-root-barrel-and-organization-nits (merged). NIT 1 was misdiagnosed in the survey (re-audited: 3 of the 5 "pre-existing barrels" are actually canonical classes, not barrels - see Notes). NIT 5 (NSFW opt-in gate audit) is filed separately under TASK-rpg-nsfw-services-add-config-level-opt-in-gate.

**Context:** The merged survey ticket captured five NITs. After re-reading the actual files during implementation scoping, only NIT 2-4 are mechanical reshapes that warrant landing. NIT 1's premise was wrong (see Notes); NIT 5 was scope-shifted to its own ticket because the audit found a real bug.

**Acceptance Criteria:**

- [ ] NIT 2: `src/rpg/encounter.ts` renamed to `src/rpg/encounters.ts`; `src/rpg/fantasy.ts` renamed to `src/rpg/fantasies.ts`; all callers updated
- [ ] NIT 3: `src/rpg/reproduction-birth.ts` + `src/rpg/reproduction-store.ts` moved into `src/rpg/reproduction/`; the existing `src/rpg/reproduction.ts` (canonical ReproductionService class) is renamed to `src/rpg/reproduction/index.ts`; imports updated
- [ ] NIT 4: new `src/rpg/index.ts` re-exports the 10 NSFW public surfaces + the canonical gameplay barrels
- [ ] Typecheck passes (`bun run typecheck`)
- [ ] Existing tests for each touched module still pass
- [ ] `giwt plan validate` exit 0
- [ ] Coverage gate: no module floor regression

**Notes:**

NIT 1 (re-audit): the survey claimed 5 pre-existing barrels used `export * from "./<dir>/service"`. Re-audit shows only 2 actual barrels exist (`body.ts` -> `./body-systems/index`, `intimacy.ts` -> curated `./intimacy/service` re-exports). The other 3 (`chemistry.ts`, `reproduction.ts`, `reputation.ts`) are canonical single-class files, not barrels - they define their own `ChemistryService` / `ReproductionService` / `ReputationService` classes inline. The "shape split" was a misread of the survey author (me). No work needed: each module picks the shape its surface needs (barrel for dir-organized services, single class for flat surfaces, curated for declaration-merged factories).

NIT 2 (plural rename): `git mv` plus update ~5 import sites each. Run `rg "from.*rpg/(encounter|fantasy)\b" src tests` to enumerate callers.

NIT 3 (reproduction dir): `git mv reproduction-birth.ts reproduction/birth.ts` and `reproduction-store.ts reproduction/store.ts`. The `reproduction.ts` canonical class moves to `reproduction/index.ts`. Update `reproduction.ts`'s own imports from `./reproduction-birth` to `./birth` and `./reproduction-store` to `./store`. Update external callers from `from "../rpg/reproduction"` to `from "../rpg/reproduction"` (unchanged - the barrel re-exports the class).

Wait: if `src/rpg/reproduction.ts` becomes `src/rpg/reproduction/index.ts`, then `import ... from "../rpg/reproduction"` resolves to `reproduction/index.ts` automatically. External callers don't change. Internal callers inside `reproduction/` use `./birth` etc.

NIT 4 (aggregate barrel): the 10 NSFW public barrels + gameplay barrels (combat, loot, dice, crafting, skills, xp, quests). Single `export *` line per file. Verify there are no name collisions (e.g. two files both exporting `Skill`).

**Related Files:**

- src/rpg/encounter.ts -> encounters.ts (NIT 2)
- src/rpg/fantasy.ts -> fantasies.ts (NIT 2)
- src/rpg/reproduction.ts -> reproduction/index.ts (NIT 3)
- src/rpg/reproduction-birth.ts -> reproduction/birth.ts (NIT 3)
- src/rpg/reproduction-store.ts -> reproduction/store.ts (NIT 3)
- src/rpg/index.ts (NIT 4 - new)
- .plan/tickets/TASK-src-rpg-module-root-barrel-and-organization-nits.md (parent survey)
- .plan/tickets/TASK-rpg-nsfw-services-add-config-level-opt-in-gate.md (sibling NSFW gate ticket)
