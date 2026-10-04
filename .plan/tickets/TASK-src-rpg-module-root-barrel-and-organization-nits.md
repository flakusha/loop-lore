<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: src/rpg/ module-root barrel and organization nits

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** Five NITs of src/rpg/ organization drift surfaced while landing the TASK-033..042 NSFW AC #1 barrels (commit 2b12542e5). Survey + proposals only - no code changes in this ticket. Resolutions land in follow-up tickets after the survey is reviewed.

**Context:** This ticket is the survey/decision record. Each NIT below is proposed (not adopted). A reviewer approves the proposals; separate implementation tickets land the changes one at a time so the diff stays boring. Surveyed while landing commit `2b12542e5 feat(rpg): add missing module barrels for the NSFW public surface` (worktree `rpg-module-barrels`). The barrel work revealed four small drifts in `src/rpg/`; plus one cross-cutting observation. All five resolve at module-root scope (re-exports + file moves), not in any subdirectory.

**Acceptance Criteria:**

- [ ] Five NITs reviewed (NIT 1-5 below)
- [ ] Each NIT marked Accepted / Deferred / Rejected with a one-line reason
- [ ] Accepted NITs converted into one implementation ticket per NIT (linked in Notes)
- [ ] Sync run: `giwt sync` exit 0
- [ ] Plan validate run: `giwt plan validate` exit 0
- [ ] Coverage gate unaffected (no src/ touched in this ticket)

**Notes:**

NIT 1 - Barrel shape inconsistency (3 styles in 10 NSFW barrels):

- 5 just-shipped barrels (`seduction.ts`, `encounter.ts`, `fantasy.ts`) use `export * from "./<dir>/index.js"` (re-export dir index)
- 5 pre-existing barrels (`body.ts`, `chemistry.ts`, `intimacy.ts`, `reproduction.ts`, `reputation.ts`) use `export * from "./<dir>/service"` (straight to service)
- 2 new barrels deviate: `mood.ts` (named `export { MoodService }`, declaration-merged factory+interface) and `nsfw-skills.ts` (named multi-export with explicit type list)

  Proposal: pick one shape. (a) `export *` from dir index is curated and surface-stable; (b) `export *` from service is thin but couples barrels to service layout; (c) named multi-export maximizes readability. Recommend (a) project-wide and migrate the 5 pre-existing barrels in a follow-up ticket.

NIT 2 - Pluralization split (3 of 10 NSFW dirs are plural):

- plural dirs: `src/rpg/encounters/`, `src/rpg/fantasies/`, `src/rpg/loot/`, `src/rpg/dice/`
- singular dirs: `src/rpg/seduction/`, `src/rpg/intimacy/`, `src/rpg/combat/`, `src/rpg/skills/`, `src/rpg/crafting/`, `src/rpg/body-systems/`
- singleton at root: `src/rpg/quests.ts` (no dir)

  The just-shipped `src/rpg/encounter.ts` and `src/rpg/fantasy.ts` use singular filenames for plural dirs. Both work, but the filename-side plural is more discoverable.

  Proposal: rename `src/rpg/encounter.ts` to `src/rpg/encounters.ts` and `src/rpg/fantasy.ts` to `src/rpg/fantasies.ts`. ~5 callers each, easy to grep.

NIT 3 - Three sibling files at root share one theme (`reproduction/`):

- `src/rpg/reproduction.ts` (top-level barrel)
- `src/rpg/reproduction-birth.ts` (birth mechanics)
- `src/rpg/reproduction-store.ts` (store helpers)

  Compare to the 10 sibling dirs (`seduction/`, `encounters/`, ...) which organize their sub-files into a single dir. The three flat files are a leftover from before the dir migration.

  Proposal: move `reproduction-birth.ts` and `reproduction-store.ts` into `src/rpg/reproduction/`, leaving `src/rpg/reproduction.ts` as the barrel. Zero behavior change.

NIT 4 - No aggregate root barrel (`src/rpg/index.ts` is missing):

  Every other domain module has one: `src/characters/index.ts`, `src/admin/index.ts`, `src/routing/index.ts`. `src/rpg/` has 30+ sub-files and no aggregate surface - callers that want multiple rpg services import each barrel individually.

  Proposal: add `src/rpg/index.ts` that re-exports the 10 NSFW public barrels (`seduction`, `intimacy`, `body`, `encounter`, `fantasy`, `pregnancy`, `pheromones`, `skills`, `mood`, `reputation`) plus the canonical gameplay barrels (`combat`, `loot`, `dice`, `crafting`, `skills`, `xp`, `quests`). The aggregate re-export is `export *` style - under NIT 1's proposal (a).

NIT 5 - `src/rpg/quests.ts` is a singleton file at root with no dir:

  Compare `src/rpg/loot/`, `src/rpg/combat/`, `src/rpg/skills/` - all have dirs. `quests.ts` is one file, no test file alongside, no sub-structure. Likely a candidate to either (a) move into an `src/rpg/quests/` dir for consistency, or (b) merge into `src/rpg/integration-registry/edges/quest.ts` (where some quest mechanics already live).

  Proposal: defer - the file is small and the answer depends on whether `quests` is a real gameplay subsystem or a thin facade. Decision goes in a follow-up spike, not this ticket.

**Related Files:**

- src/rpg/seduction.ts (NIT 1, NIT 2)
- src/rpg/encounter.ts (NIT 1, NIT 2)
- src/rpg/fantasy.ts (NIT 1, NIT 2)
- src/rpg/mood.ts (NIT 1)
- src/rpg/nsfw-skills.ts (NIT 1)
- src/rpg/intimacy.ts (existing barrel, NIT 1)
- src/rpg/body.ts (existing barrel, NIT 1)
- src/rpg/reproduction.ts (NIT 3)
- src/rpg/reproduction-birth.ts (NIT 3)
- src/rpg/reproduction-store.ts (NIT 3)
- src/rpg/chemistry.ts (existing barrel, NIT 1)
- src/rpg/reputation.ts (existing barrel, NIT 1)
- src/rpg/quests.ts (NIT 5 - deferred)
- src/rpg/ (NIT 4 - aggregate root missing)
- .plan/tickets/TASK-033.md through TASK-042.md (acceptance criteria that drove the barrel work)
- .plan/tickets/TASK-add-missing-rpg-module-barrels.md (the parent work ticket for the barrel landing)
