<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character ↔ World Integration (Shared Domain Models)

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** High
**Effort:** Large (composite)
**Type:** Feature Epic
**Tags:** character, world, integration, shared-models, rpg, emergence
**Related:** epic-character-core-system.md, epic-character-growth.md, epic-character-internal-traits.md, epic-weather-environment.md, epic-faction-reputation.md, epic-economy-trading.md, epic-lore-knowledge.md, epic-2d-sprite-world.md, epic-social-interaction.md
**Source:** cross-research synthesis, 2026-09-21 (character rich-extension fields × world simulation planning)

## Overview:

The richer character extension fields promoted in `src/characters/spec/character.ts`
(abilities, skills, conditions, relationships, motivations, vitals, equipment,
speech patterns, languages, alignment) are currently spec-only and unconsumed.
World-side systems (weather, factions, lore propagation, market zones, NPC
simulation, dialogue) are planned separately and re-define adjacent concepts.
This epic designates the character-side models as **shared domain contracts**
consumed by both character logic and world systems, so world events shape
characters and character state shapes world resolution — the precondition for
emergent behavior.

## Status Context (reviewed 2026-09-21)

- Character side: rich fields are types-only (`AbilityScore`, `Skill`,
  `EquipmentSlot`, `Vital`, `Motivation`, `Condition`, `SpeechPatterns`,
  `languages`, `alignment` on `CanonicalCharacter`) — no DB columns, no
  validator/API handling, no prompt section, no FE editors. Implemented
  runtime counterparts: `Relationship` (relationships-service), character
  `Skill` (`src/rpg/skills/service`), combat conditions and equipment
  plumbing (`src/rpg/service/character-stats.ts`, `src/rpg/combat/`).
- World side: lore `audience_scope` gating implemented
  (`src/assistant/lore/audience.ts`); battle-scoped weather/hazard modifiers
  implemented (`src/battle/weather-integration/`); faction standing schema,
  layered weather, world state machine (War/Festival/Plague/Famine),
  biome hazards, market dynamics, and dialogue conditions are planning-only.

## Design Principles

1. **Shared contracts, not copies.** Each character model lives in one module
   under `src/characters/spec/` (or a promoted `src/domain/` if circular
   imports demand it); world systems import the type, never re-declare it.
2. **Read-side first.** World systems consume character state read-only
   (skill checks, gating, scaling) before any write-back (conditions, vitals
   drain). Write-back lands per-ticket behind the world tick.
3. **Prompt-visible consequences.** Every applied integration (a weather-
   induced condition, standing-shifted relationship) must surface in prompt
   assembly so the LLM narrates it.

## Work Items

Integration tickets (new, this epic):

- [ ] Shared domain model promotion. → TASK-shared-character-domain-models
- [ ] Biome hazards × skill countermeasures. → TASK-skill-biome-hazard-countermeasures
- [ ] Skill-check slash commands (dice × Skill × AbilityScore). → TASK-skill-check-slash-commands
- [ ] Weather layers → conditions + vitals drain + equipment protection. → TASK-weather-conditions-vitals-bridge
- [ ] World state machine as motivation/goal context. → TASK-world-state-motivation-context
- [ ] Faction membership → relationships + standing propagation. → TASK-faction-membership-relationship-propagation
- [ ] Language-gated lore visibility. → TASK-language-gated-lore-visibility
- [ ] Equipment/inventory ↔ market demand feedback. → TASK-equipment-market-demand-feedback
- [ ] Condition-driven NPC behavior. → TASK-condition-driven-npc-behavior
- [ ] Alignment dialogue gating + context-aware speech formality. → TASK-alignment-speech-social-context

Already ticketed elsewhere (referenced, not duplicated here):

- Lore distortion weighting by relationship trust → TASK-world-lore-lifecycle-confidence-decay-distortion
- Faction standing drift on world tick + rumor propagation → TASK-faction-standing-and-reputation-drift-integration
- Race/origin/culture lore-audience dimensions → FEAT-race-origin-lore-identity-model
- NPC simulation tiers (T0–T3, tick, snapshots) → FEAT-2d-world-npc-simulation-tiers-t0-t3-ts-tick-event-driven-sna
- Encounter scaling via party stats → TASK-ai-director-difficulty + epic-mini-games-expanded.md `DifficultyScaling`
- Weather environment sim (climate zones, seasons) → epic-weather-environment.md
- Species data layer implemented; species-rule extensions tracked under species tickets.

## Non-Goals

- Re-implementing weather/economy/faction simulation engines (owned by their epics) — this epic owns only the character-side seams.
- Full DB persistence of every rich field (tracked separately: stat-allocation tickets under epic-character-core-system.md, migration 023).

## Acceptance Criteria

- [ ] No world-system module re-declares a character domain type; shared imports only.
- [ ] At least one read-side integration (skill check or lore gating) and one write-back integration (condition application) are live behind the world tick.
- [ ] Applied character-world effects are visible in prompt sections.
- [ ] Each child ticket's acceptance criteria pass.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| epic-weather-environment.md | weather layers, hazards | condition + vitals bridge |
| epic-faction-reputation.md | standing schema, drift | relationship propagation |
| epic-economy-trading.md | market dynamics, trade events | demand feedback loop |
| epic-lore-knowledge.md / audience_scope | lore visibility gating | language-gated access |
| epic-2d-sprite-world.md (NPC sim tiers) | world tick substrate | write-back scheduling |
| epic-social-interaction.md | DialogueNode/DialogueCondition | alignment gating |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| epic-character-growth.md | world-event growth triggers | skill/trait drift from environment |
| epic-character-internal-traits.md | disposition/aspirations | motivation context modifiers |
| epic-mini-games-expanded.md | party skill profile | encounter difficulty scaling |
