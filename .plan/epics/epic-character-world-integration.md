<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Character ↔ World Integration (Shared Domain Models)

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** verified 2026-10-09 — genuinely not started: the character rich fields are still types-only (`src/characters/spec/character-richer-fields.ts`, imported by no module outside `spec/`), none of the ten `TASK-*` work items has code, and the world-side inputs this epic would consume are equally absent (no faction-standing schema, no world state machine, no layered weather, no market dynamics, no dialogue conditions in `src/`); only the two already-shared read-side pieces exist (`src/assistant/lore/audience.ts`, `src/battle/weather-integration/`).
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

## Implemented (verified 2026-10-09)

Nothing in this epic has landed, but three building blocks it depends on are real:

- **Character rich field types** — `src/characters/spec/character-richer-fields.ts`
  declares `AbilityScore`, `Skill`, `EquipmentSlot`, `Vital`, `Motivation`,
  `Condition`, `SpeechPatterns`, `PersonalityTrait`, `AppearanceDetails`, `Tag`,
  inventory item shapes. Imported only by `src/characters/spec/character.ts:22` — no
  DB columns, no validator branch, no prompt section, no frontend editor consumes them.
- **Read-side world inputs already shared** — lore `audience_scope` gating
  (`src/assistant/lore/audience.ts`, see `epic-character-npc-lore-access.md`) and
  battle-scoped weather/hazard modifiers (`src/battle/weather-integration/`).
- **Runtime counterparts that exist for other epics** — `Relationship`
  (relationships-service), character `Skill` (`src/rpg/skills/service`), combat
  conditions and equipment plumbing (`src/rpg/service/character-stats.ts`,
  `src/rpg/combat.ts`).

## Current State

| Surface | Status | Where |
| ------- | ------ | ----- |
| Character rich fields (`AbilityScore`, `Vital`, `Motivation`, `Condition`, `SpeechPatterns`, …) | Types only | `src/characters/spec/character-richer-fields.ts` (imported solely by `spec/character.ts:22`) |
| DB columns / validator / prompt / FE editors for those fields | Not shipped | no `abilities`/`vitals`/`motivations` columns in `src/db/` |
| Lore `audience_scope` gating (read-side input) | Shipped | `src/assistant/lore/audience.ts` |
| Battle weather/hazard modifiers (read-side input) | Shipped | `src/battle/weather-integration/` |
| Faction standing schema, layered weather, world state machine, biome hazards, market dynamics, dialogue conditions | Not shipped | no matches anywhere in `src/` |
| All ten `TASK-*` work items below | Not started | no code |

## Unticketed Gaps

The epic's first work item — "Shared domain model promotion" — has no ticket of its
own beyond `TASK-shared-character-domain-models`, yet it is the prerequisite for the
other nine: until `AbilityScore` / `Vital` / `Motivation` / `Condition` are promoted out
of `src/characters/spec/`, every downstream item would import a type that nothing
persists, so a write-back integration would silently drop data. There is also no
planned migration for the rich fields themselves — `Non-Goals` defers "full DB
persistence" to the stat-allocation tickets under `epic-character-core-system.md`, but
those cover only stat allocation, not vitals/equipment/motivation storage. Both are
sequencing gaps without a ticket; the ten work items below carry the feature scope.

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

## Linked Tasks

Integration tickets for this epic — all ten ticket files read **Not Started**
(statuses read 2026-10-09); no code exists for any of them.

- `TASK-shared-character-domain-models.md` (Not Started) — promote the rich field types out of `src/characters/spec/`
- `TASK-skill-biome-hazard-countermeasures.md` (Not Started) — biome hazards × skill countermeasures
- `TASK-skill-check-slash-commands.md` (Not Started) — skill checks (dice × Skill × AbilityScore)
- `TASK-weather-conditions-vitals-bridge.md` (Not Started) — weather layers → conditions + vitals drain + equipment protection
- `TASK-world-state-motivation-context.md` (Not Started) — world state machine as motivation/goal context
- `TASK-faction-membership-relationship-propagation.md` (Not Started) — faction membership → relationships + standing
- `TASK-language-gated-lore-visibility.md` (Not Started) — language-gated lore visibility
- `TASK-equipment-market-demand-feedback.md` (Not Started) — equipment/inventory ↔ market demand
- `TASK-condition-driven-npc-behavior.md` (Not Started) — condition-driven NPC behaviour
- `TASK-alignment-speech-social-context.md` (Not Started) — alignment dialogue gating + speech formality

## Files

Implemented (verified 2026-10-09) — inputs only, none of them is this epic's output:

- `src/characters/spec/character-richer-fields.ts` — the rich field type definitions
- `src/characters/spec/character.ts:22` — sole importer of those types
- `src/assistant/lore/audience.ts` — lore audience gating consumed for language/identity-gated visibility
- `src/battle/weather-integration/` — battle-scoped weather/hazard modifiers
- `src/rpg/service/character-stats.ts`, `src/rpg/combat.ts` — runtime stat/condition plumbing

Planned (do not exist yet):

- the promoted shared domain module (this epic proposes `src/domain/` if circular imports demand it)
- DB columns, validator handling, prompt section and frontend editors for the rich fields
- faction standing schema, layered weather, world state machine, biome hazard rules,
  market dynamics and dialogue conditions — all still planning-only

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
