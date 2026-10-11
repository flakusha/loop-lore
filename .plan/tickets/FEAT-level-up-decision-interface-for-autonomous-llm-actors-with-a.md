<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Level-up decision interface for autonomous LLM actors with affinity auto-allocation

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** character-xp-leveling
**Related:** .plan/epics/epic-actor-autonomy-story-drive.md (decision/turn machinery the staged level-up resolves through), .plan/tickets/FEAT-automatic-organic-stat-growth-and-allocatable-ability-points.md (pending ASI budget this decision spends)

**Summary:**

A level-up decision surface for autonomous actors: when an actor crosses an XP threshold, stage a pending level-up (new service table or `character_stats` column) that the LLM actor resolves through its in-world decision flow — choose an ASI split (or a feat/flag), optionally pick a new skill specialization via `SkillsService.specializeSkill` (`src/rpg/skills/service/progression.ts:81-105`). The decision should be representable in the actor's plan/question machinery (cf. `src/rpg/questions/`, `.plan/epics/epic-actor-autonomy-story-drive.md`) so an autonomous actor can settle it during its own turn rather than requiring a human. Includes an affinity/algorithm mode: a deterministic allocator (highest-usage skill's governing ability, combat alignment weighting via `character_stats.combat_alignment`) that auto-resolves pending level-ups for actors with no explicit choice, so leveling never blocks autonomous play.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
