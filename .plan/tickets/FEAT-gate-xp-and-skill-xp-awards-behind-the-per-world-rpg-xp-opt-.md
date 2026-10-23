<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Gate XP and skill XP awards behind the per-world rpg_xp opt-in

**Status:** In Progress
**Status Note:** `RpgMechanic.Xp` (`src/rpg/service/world-gate.ts:71`) has zero production callers on dev — gate unenforced; work in branch `xp-reward-sources`; verified 2026-10-23
**Priority:** high
**Effort:** Medium
**Caveats:** authorization — every award site (routes, legs, seduction/encounter awarders) grants regardless of `worlds.rpg_xp` until this lands
**Epic:** epic-character-xp-leveling
**Tags:** rpg, xp, world-opt-in
**Related:** .plan/tickets/FEAT-levelservice-apply-awarded-xp-to-character-stats-and-level-u.md (the award API this guards), src/rpg/service/world-gate.ts (the gate being enforced), .plan/tickets/TASK-rpg-per-mechanic-opt-in-config-worldmechanicsconfig-schema-s.md (per-mechanic opt-in config origin)

**Summary:**

The per-world XP opt-in already exists end to end — `worlds.rpg_xp` (`src/db/schema-story.ts:151`; migration `src/db/migrations/001_init.ts:3777-3811`, parity backfill :3810), create/update plumbing `rpgCreateFlags`/`applyRpgUpdates` (`src/routes/worlds/world-rpg-flags.ts:42-53,64-94`), and the gate `checkMechanicEnabled(db, worldId, RpgMechanic.Xp)` (`src/rpg/service/world-gate.ts:153`) — but no XP award path enforces it. Ungated today: `POST /api/rpg/xp/award` + friends (`src/routes/rpg/xp-loot.ts:47-156`), `POST /api/rpg/skills/:id/xp` (`src/routes/rpg/skills-progression.ts:129`), the `level`/`xp`/`xpToNext` fields on `PATCH /api/rpg/stats/:actorId` (`src/routes/rpg/stats-actor.ts:159-161`), and both production awarders (`src/rpg/seduction/service/settle.ts:69-78`, `src/rpg/encounters/service/participant-legs.ts:97-113`). Guard precedents to follow: `checkCommandMechanic` callers `src/assistant/commands/attack.ts:39`, `battle.ts:52`, `dice.ts:169,178`, `interaction.ts:123`; `checkRpgEnabled` when a worldId is resolvable (`src/routes/rpg/stats-actor.ts:79`). Thread `worldId` through the award APIs, decide fail-open vs fail-closed for world-less contexts (contrast the fail-open chat gate, `world-gate.ts:193`), and add tests mirroring `src/rpg/service/world-gate.test.ts` + `src/routes/worlds/worlds-routes.test.ts:154-245`.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
