<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: AO NSFW Game Mechanics

**Status:** Draft
**Priority:** High
**Effort:** Very High
**Type:** Feature Epic
**Issue:** `30a1b4b`
**Tags:** nsfw, rpg, game-mechanics, adult, intimacy, relationships

## Overview

Game mechanics for adult/NSFW content — intimacy systems, seduction, relationship progression, adult encounters, desires, fetishes, pregnancy/reproduction, body systems, pheromones, aphrodisiacs, heat/rut cycles, and mature narrative mechanics. This epic covers the **gameplay layer** of NSFW content, not the safety/consent infrastructure (that lives in `epic-logic-reconciliation.md` NSFW Support section and `docs/.nsfw/research.md`).

## NSFW Gameplay Systems

> Spec detail removed during rebase cleanup (2026-08): the per-system
> level/category interfaces below were unmaintained prose duplicating the
> canonical enums. Reintroduce any system by extending
> `src/db/enums-character/nsfw.ts`, adding a tier in
> `src/schemas/nsfw-rating.ts`, and gating via `[nsfw]` in
> `configs/config.nsfw.example.toml`.
>
> Canonical enum families: `IntimacyLevel`, `ArousalLevel`, `NsfwEncounterType`,
> `ContentIntensity`, `NarrativeStyle`, `SeductionSkillCategory`,
> `FantasyCategory`, `BodyBuild`, `SizeCategory`, `HeatPhase`, `NsfwLocationType`.

## Implementation Phases

### Phase 1: Core Intimacy & Relationship

- Intimacy levels and progression
- Basic seduction mechanics
- Threshold events
- Mood system basics

### Phase 2: Body & Physical Systems

- Physique profiles
- Appearance system
- Basic arousal mechanics
- Stamina/endurance

### Phase 3: Advanced Seduction

- Desire profiles
- Turn-ons/turn-offs
- Seduction skills
- Arousal modifiers

### Phase 4: Encounter System

- Adult encounter structure
- Encounter phases
- Skill checks during encounters
- Encounter outcomes

### Phase 5: Fantasy & Kink

- Fantasy system
- Kink discovery
- Fantasy fulfillment
- Kink mechanics

### Phase 6: Reproduction & Chemistry

- Pregnancy system
- Heat cycles
- Pheromone system
- Aphrodisiacs

### Phase 7: Social & Reputation

- Reputation system
- Rumors
- Social consequences
- Public perception

### Phase 8: Advanced Systems

- Trauma & recovery
- Species-specific mechanics
- Cross-species interactions
- Advanced techniques

## Open Questions

1. **Consent integration**: How do game mechanics interact with consent system? (All non-consensual = violation mechanics)
2. **Species mechanics**: How deep should species-specific reproduction/attraction go?
3. **Fade-to-black vs explicit**: Should mechanics work with both narrative styles?
4. **Age verification**: How do mechanics enforce age verification before activation?
5. **Content warnings**: Should mechanics trigger content warnings for extreme kinks?
6. **Balance**: How to balance NSFW mechanics with core gameplay so it doesn't dominate?
7. **LLM prompts**: How to prompt the LLM to handle NSFW mechanics accurately?
8. **Memory impact**: How do NSFW memories affect character relationships long-term?
9. **Multiplayer**: How do NSFW mechanics work in multi-user scenarios?
10. **Modding**: Should NSFW mechanics be moddable/extensible by plugins?

## Tasks

| Task                                | Priority | Effort    | Status      |
| ----------------------------------- | -------- | --------- | ----------- |
| TASK-nsfw-intimacy-system.md        | High     | Large     | Not Started |
| TASK-nsfw-seduction-desire.md       | High     | Large     | Not Started |
| TASK-nsfw-body-physical.md          | Medium   | Large     | Not Started |
| TASK-nsfw-encounter-system.md       | High     | Very High | Not Started |
| TASK-nsfw-fantasy-kink.md           | Medium   | Large     | Not Started |
| TASK-nsfw-pregnancy-reproduction.md | Medium   | Large     | Not Started |
| TASK-nsfw-pheromones-chemistry.md   | Medium   | Medium    | Not Started |
| TASK-nsfw-reputation-social.md      | Medium   | Medium    | Not Started |
| TASK-nsfw-skills-experience.md      | High     | Large     | Not Started |
| TASK-nsfw-mood-emotional.md         | High     | Medium    | Not Started |
| TASK-nsfw-location-environment.md   | Medium   | Medium    | Not Started |
| TASK-nsfw-heat-cycles.md            | Medium   | Medium    | Not Started |
| TASK-nsfw-trauma-recovery.md        | Medium   | Medium    | Not Started |
| TASK-nsfw-species-mechanics.md      | Low      | Very High | Not Started |

## Integration Points

### Systems This Epic Depends On

| System                 | What It Provides                           | How Used                                                        |
| ---------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| RPG Mechanics          | Stats (CHA, WIS, CON), dice resolution, XP | Seduction skill checks, arousal calculations, XP for encounters |
| Character Core         | Personality, mood, relationships, traits   | Intimacy progression, mood modifiers, relationship state        |
| Social Interaction     | Persuasion, reputation, dialogue           | Seduction mechanics, reputation effects, social consequences    |
| Magic & Spell Systems  | Enchantment, potion effects                | Aphrodisiacs, magical seduction, heat cycle manipulation        |
| Crafting & Professions | Potion brewing, item creation              | Aphrodisiac crafting, contraceptive items, toys                 |
| Resolution System      | Unified dice/action resolution             | Skill checks during encounters, seduction rolls                 |

### Systems That Depend On This Epic

| System                  | What It Consumes                | How Used                                                       |
| ----------------------- | ------------------------------- | -------------------------------------------------------------- |
| Battle & Action Systems | Combat injuries, wounds         | Injury system from NSFW encounters, wound narratives           |
| Housing & Base Building | Private spaces, bedroom bonuses | NSFW encounters in player housing, comfort modifiers           |
| Weather & Environmental | Environmental mood              | Weather affects encounter atmosphere and location availability |
| Disease & Poison        | Reproductive health, STDs       | Pregnancy complications, sexually transmitted conditions       |
| Companion, Pet & Mount  | Companion relationships         | Romantic companions, bonding through intimacy                  |

### Shared Data Contracts

| Contract          | Shared With                       | Purpose                                                     |
| ----------------- | --------------------------------- | ----------------------------------------------------------- |
| `StatusEffect`    | RPG, Battle, Disease, Social      | Shared buff/debuff model (arousal, pheromone effects)       |
| `CharacterStats`  | RPG, Character Core, Social       | CHA/WIS/CON affect seduction and resistance                 |
| `ReputationScore` | Social, Crime, Faction            | Shared reputation model (NSFW reputation feeds into social) |
| `Relationship`    | Character Core, Social, Companion | Shared relationship state model                             |

### Cross-System Events

| Event                      | Direction                      | Purpose                                                  |
| -------------------------- | ------------------------------ | -------------------------------------------------------- |
| `intimacy.level_changed`   | emits → Social, Character Core | Relationship level changes affect social interactions    |
| `nsfw.encounter_completed` | emits → Disease, XP, Social    | Triggers pregnancy checks, grants XP, affects reputation |
| `nsfw.reputation_changed`  | emits → Social, Faction        | NSFW reputation affects faction standing                 |
| `housing.nsfw_encounter`   | subscribes ← Housing           | Housing provides private space modifiers for encounters  |
| `weather.changed`          | subscribes ← Weather           | Weather affects encounter atmosphere                     |

---

## Related Epics

- **Epic: RPG Mechanics** — Stats, combat, skills, XP, loot (NSFW skills are RPG skills)
- **Epic: Battle & Action Systems** — State management, mode transitions
- **Epic: World & Locations** — Locations, NPCs, environment
- **Epic: Logic Reconciliation** — NSFW support, moderation, safety
- **Epic: Plugin System** — NSFW content modding via plugins
- **Epic: Assistant/GM Flows** — GM-driven NSFW scenarios

## Linked Tasks

- TASK-nsfw-game-mechanics.md
- TASK-nsfw-reputation-consequences.md
