<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Per-world skills mechanic flag and world-creation opt-in UI

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** character-xp-leveling
**Tags:** rpg, skills, world-opt-in
**Related:** .plan/tickets/FEAT-gate-xp-and-skill-xp-awards-behind-the-per-world-rpg-xp-opt-.md (the enforcement this flag configures), .plan/tickets/TASK-rpg-world-ruleset-templates-applied-at-creation.md (world-creation-time config precedent)

**Summary:**

The per-world mechanic set is fixed at six axes with no skills entry: `MechanicsConfig { dice, checks, combat, xp, loot, quests }` and `RpgMechanic` (`src/rpg/service/world-gate.ts:57-74`), columns `worlds.rpg_dice`..`rpg_quests` (`src/db/schema-story.ts:147-153`), create/update helpers (`src/routes/worlds/world-rpg-flags.ts:42-94`). Add a `skills` mechanic: new `worlds.rpg_skills` column + `Worlds` interface + schema manifest regen, `MechanicsConfig.skills` + `RpgMechanic.Skills`, `rpgMasterMechanics` axis (`world-gate.ts:104-108`), and `rpgCreateFlags`/`applyRpgUpdates` handling; skill-progression awarders (`SkillsService.addXp` call sites, `src/rpg/skills/service/progression.ts:19`) then gate on `RpgMechanic.Skills`. Frontend: the create-world form sends only name/description/lore (`src/partials/worlds/create-modal.html:16-70`; payload serialization `src/frontend/pages/worlds.ts:36-67`) — add opt-in flag inputs (following `WorldCreateBody` field names, `src/validation/schemas/worlds.ts:16-30`) so creation-time opt-in is settable from the UI rather than API-only.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
