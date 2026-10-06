<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add missing rpg module barrels (TASK-034 / 036 / 037 / 040 / 041 AC #1)

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-nsfw-game-mechanics
**Tags:** nsfw, rpg, game-mechanics, tech-debt

**Summary:**

Five NSFW-game-mechanics tickets (TASK-034 seduction, TASK-036 encounter, TASK-037 fantasy, TASK-040 NSFW skills, TASK-041 mood) require `src/rpg/<name>.ts` to expose the canonical service in their AC #1, but only `intimacy.ts`, `body.ts`, `reproduction.ts`, `reputation.ts`, and `chemistry.ts` have the thin barrel on disk; the other five are bare directories without a `rpg/<name>.ts` re-export. Add the five missing barrels following the existing `body.ts` (`export * from "./<dir>/index.js";`) and `intimacy.ts` (curated) patterns.

**Context:**

After the 2026-09-27 NSFW game-mechanics batch closeout (commit `fb04d175b`), per-ticket review on dev confirmed:

- `IntimacyService` barrel exists (`src/rpg/intimacy.ts`).
- `SeductionService` barrel missing (`src/rpg/seduction.ts`); implementation at `src/rpg/seduction/service/index.ts:59`.
- `BodySystemService` barrel exists (`src/rpg/body.ts`).
- `EncounterService` barrel missing (`src/rpg/encounter.ts`); implementation at `src/rpg/encounters/service/index.ts:48`.
- `FantasyService` barrel missing (`src/rpg/fantasy.ts`); implementation at `src/rpg/fantasies/service/index.ts:50`.
- `ReproductionService` barrel exists (`src/rpg/reproduction.ts` IS the implementation file).
- `ChemistryService` barrel exists (`src/rpg/chemistry.ts` IS the implementation file).
- NSFW skills barrel missing (`src/rpg/nsfw-skills.ts`); shared XP flows through `src/rpg/skills/service` (TASK-040's Resolution block documents this honestly — no `NsfwSkillService` class exists).
- `MoodService` barrel missing (`src/rpg/mood.ts`); canonical service at `src/characters/services/mood-service/` (Character Core).
- `ReputationService` barrel exists (`src/rpg/reputation.ts` IS the implementation file).

Landing the five missing barrels so each AC #1 in the corresponding NSFW ticket becomes literally true on disk, not just semantically satisfied by a deep-path import.

**Acceptance Criteria:**

- [ ] `src/rpg/seduction.ts` re-exports `./seduction/index.js` (thin barrel like `body.ts`).
- [ ] `src/rpg/encounter.ts` (singular) re-exports `./encounters/index.js`.
- [ ] `src/rpg/fantasy.ts` (singular) re-exports `./fantasies/index.js`.
- [ ] `src/rpg/mood.ts` re-exports the canonical `MoodService` from `../characters/services/mood-service/` (curated barrel like `intimacy.ts`).
- [ ] `src/rpg/nsfw-skills.ts` re-exports `SkillsService` from `./skills/service` plus `SeductionSkillCategory` from `../db/enums-character/nsfw`.
- [ ] All five barrels carry the LGPL-3.0 SPDX header (matching `body.ts`).
- [ ] No source-code behavior changes — barrels are pure re-exports.
- [ ] `bun run check` green; relevant test suite green.

**Related Files:**

- `src/rpg/body.ts` — thin-barrel pattern (template).
- `src/rpg/intimacy.ts` — curated-barrel pattern (template).
- `src/rpg/seduction/index.ts` — seduction public surface.
- `src/rpg/encounters/index.ts` — encounter public surface.
- `src/rpg/fantasies/index.ts` — fantasy public surface.
- `src/rpg/skills/index.ts` — shared skills public surface.
- `src/db/enums-character/nsfw.ts:SeductionSkillCategory` — NSFW skill enum.
- `src/characters/services/mood-service/index.ts` — Character Core `MoodService`.

**Notes:**

- Open Question #6 (NSFW skill balance) is unaffected — barrels don't change XP rates, only the import path.
- After this lands, the AC #1 checkbox in each of TASK-034 / 036 / 037 / 040 / 041 Resolution blocks becomes literally verifiable.
