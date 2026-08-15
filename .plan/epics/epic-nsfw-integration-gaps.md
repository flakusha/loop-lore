# EPIC: NSFW Integration Gaps — Housing, Weather, Social, Disease

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Issue:** `30a1b4b`
**Type:** Feature Epic
**Tags:** nsfw, integration, housing, weather, social, disease, cross-system

## Summary

The NSFW epic (`epic-nsfw-game-mechanics.md`, 848 lines) defines 8 gameplay systems but has zero cross-references to Housing, Weather, Social, or Disease systems. This epic tracks the integration work to close these gaps.

> **Wiring status (verified 2026-08-04):** the "no corresponding code found" assessment is stale **for backend routing** — the base NSFW stack is mounted: `nsfwRoutes` (`elysia-app.ts:193`), `nsfwModerationRoutes` (`:194`), `adminNsfwRoutes` (`:174`). What is genuinely not started is the **cross-system integration matrix** below (Housing/Weather/Social/Disease links into the 8 NSFW gameplay systems) — this epic's actual scope.

## Overview

### Current State Assessment

The NSFW system has 8 interconnected gameplay systems:

1. **Intimacy & Relationship Progression** — intimacy levels, actions, threshold events
2. **Seduction & Desire System** — desire profiles, seduction skills, arousal states
3. **Adult Encounter System** — structured adult scenes with phases and outcomes
4. **Body & Physical Systems** — physique, health, appearance, modifications
5. **Pheromones & Chemical Influence** — biological/chemical attraction mechanics
6. **Fantasy & Kink Mechanics** — mechanical support for various kinks/fantasies
7. **Pregnancy & Reproduction** — full pregnancy mechanics for species
8. **Sexual Skills & Experience** — skills that improve with practice

### Cross-Mechanics Integration Matrix

| System   | RPG | Battle | Magic | Crafting | Companion | Housing | Disease | Social | Weather | Exploration | Economy | Crime | Faction | NSFW | CharCore | Resolution | Narrative |
| -------- | --- | ------ | ----- | -------- | --------- | ------- | ------- | ------ | ------- | ----------- | ------- | ----- | ------- | ---- | -------- | ---------- | --------- |
| **NSFW** | ⬅️   | —      | 🚫    | 🚫       | 🚫        | ❌      | ❌      | ❌     | ❌      | 🚫          | 🚫      | 🚫    | 🚫      | —    | ✅       | 🚫         | ✅        |

### Identified Gaps

#### 🟡 Medium — One-way links or missing cross-references

| #  | System A | System B    | Current State                                                                                                   | Recommended Action                                                                                           |
| -- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| G6 | **NSFW** | **Housing** | NSFW defines NSFWLocation types (bedroom, bath); Housing provides private spaces. Neither references the other. | Add integration: housing provides private spaces with comfort bonuses for NSFW encounters.                   |
| G7 | **NSFW** | **Weather** | NSFW defines location modifiers; Weather defines environmental mood. Neither references the other.              | Add integration: weather affects NSFW encounter mood and location availability.                              |
| G8 | **NSFW** | **Social**  | NSFW seduction/reputation overlap with Social's reputation and persuasion. Neither cross-references.            | Add integration: social skills (persuasion, deception) are seduction prerequisites; shared reputation model. |
| G9 | **NSFW** | **Disease** | Pregnancy/reproduction never references Disease for reproductive health ailments.                               | Add integration: disease system covers reproductive health, STDs from NSFW encounters.                       |

## Integration Points

### Systems This Epic Depends On

| System         | What It Provides                           | How Used                                        |
| -------------- | ------------------------------------------ | ----------------------------------------------- |
| Housing        | Private space types, comfort/safety levels | NSFW encounter location modifiers               |
| Weather        | Environmental mood, pheromone dispersion   | NSFW mood and encounter availability            |
| Social         | Reputation model, persuasion skills        | NSFW seduction prerequisites and reputation     |
| Disease        | Reproductive health, STD status            | NSFW encounter risk and pregnancy complications |
| Character Core | Traits, mood, relationships, NSFW rating   | NSFW encounter context and gating               |

### Systems That Depend On This Epic

| System         | What It Consumes                    | How Used                               |
| -------------- | ----------------------------------- | -------------------------------------- |
| Chat Lifecycle | NSFW toggle state, consent tracking | Moderation gating                      |
| Analytics      | NSFW encounter metrics              | Safety dashboard, cost tracking        |
| Economy        | NSFW item trading                   | Premium currency, marketplace          |
| Plugin System  | NSFW content extensions             | Custom kink mechanics, content filters |

### Shared Data Contracts

| Contract             | Shared With           | Purpose                           |
| -------------------- | --------------------- | --------------------------------- |
| `ReputationScore`    | Social, Faction, NSFW | Unified reputation across systems |
| `NSFWLocationType`   | Housing               | Private space classification      |
| `ReproductiveHealth` | Disease               | STD status, fertility tracking    |
| `EnvironmentalMood`  | Weather               | Mood modifiers for encounters     |
| `ConsentState`       | Chat Lifecycle        | Consent tracking for encounters   |
| `NSFWContentRating`  | Character Core        | Content rating enforcement        |

### Cross-System Events

| Event                           | Direction  | Purpose                                    |
| ------------------------------- | ---------- | ------------------------------------------ |
| `nsfw.encounter.started`        | emits      | Trigger weather/housing modifier injection |
| `nsfw.encounter.completed`      | emits      | Update reputation, disease status, mood    |
| `weather.changed`               | subscribes | Recalculate pheromone effectiveness        |
| `disease.transmitted`           | subscribes | Apply NSFW encounter risk                  |
| `housing.privacy.level.changed` | subscribes | Update encounter discovery risk            |
| `social.skill.used`             | subscribes | Apply seduction prerequisite check         |
| `consent.revoked`               | subscribes | Disable NSFW encounters                    |

## NSFW System Integration Details

### G6: NSFW ↔ Housing Integration

**Private Spaces**: Housing provides private location types (bedroom, bath, private chambers) that map to NSFW encounter settings.

```typescript
// Housing provides private spaces with comfort/safety levels
interface HousingPrivacy {
  location_type: "bedroom" | "bath" | "private_chamber" | "secluded_garden";
  privacy_level: number; // 0-100
  comfort_level: number; // 0-100
  safety_level: number; // 0-100
  discovery_risk: number; // 0-100 (lower = safer)
}

// NSFW encounters use housing privacy for discovery risk
interface NSFWEncounterLocation {
  housing_location_id: string;
  privacy_modifier: number; // -50 to +50
  comfort_bonus: number; // +0 to +20 satisfaction
  safety_bonus: number; // +0 to +20 trust
  discovery_risk: number; // 0-100
}
```

**Integration Tasks**:

- Map Housing location types to NSFWLocationType enum
- Apply comfort/safety bonuses to NSFW encounter outcomes
- Calculate discovery risk based on housing privacy
- Support housing equipment (beds, furniture) as encounter modifiers

### G7: NSFW ↔ Weather Integration

**Environmental Mood**: Weather affects NSFW encounter mood, pheromone dispersion, and location availability.

```typescript
// Weather affects NSFW encounters
interface WeatherNSFWModifiers {
  mood_modifier: number; // -10 to +10
  pheromone_dispersion: number; // 0.5x to 2x
  location_availability: string[]; // which outdoor locations are usable
  intimacy_difficulty: number; // -20 to +20
}

// NSFW mood system integrates weather
interface NSFWMoodWithWeather {
  base_mood: number; // from character mood system
  weather_modifier: number; // from Weather system
  combined_mood: number; // final mood for encounter
}
```

**Integration Tasks**:

- Weather mood modifiers feed into NSFW mood system
- Weather affects pheromone dispersion (range, effectiveness)
- Weather affects location availability for NSFW encounters
- Seasonal effects on fertility cycles and heat periods

### G8: NSFW ↔ Social Integration

**Shared Reputation Model**: NSFW encounter outcomes affect reputation in Social system.

```typescript
// Shared reputation schema
interface ReputationScore {
  value: number; // -100 to +100
  tier: "hostile" | "unfriendly" | "neutral" | "friendly" | "allied" | "devoted";
  source: "social" | "faction" | "nsfw" | "combined";
  last_modified: Date;
  decay_rate: number; // per day
  modifiers: ReputationModifier[];
}

// NSFW encounter reputation changes
interface NSFWReputationChange {
  encounter_id: string;
  character_id: string;
  reputation_change: number;
  reason: string; // "successful seduction", "failed encounter", etc.
  social_context: string; // "public", "private", "group"
}
```

**Integration Tasks**:

- Unified `ReputationScore` schema used by Social, Faction, and NSFW
- Social skills (persuasion, deception, intimidation) as seduction prerequisites
- NSFW encounter reputation changes feed into Social reputation model
- Social relationship tiers map to NSFW intimacy levels

### G9: NSFW ↔ Disease Integration

**Reproductive Health**: Disease system covers reproductive health, STDs from NSFW encounters.

```typescript
// Disease system covers reproductive health
interface ReproductiveHealth {
  fertility: number; // 0-100
  pregnancy_risk: boolean;
  contraception: ContraceptionMethod[];
  sexually_transmitted: STDStatus;
  heat_cycle: HeatCycle | null;
}

// NSFW encounters can transmit diseases
interface NSFWEncounterDiseaseRisk {
  encounter_id: string;
  participants: string[];
  disease_risks: DiseaseRisk[];
  transmission_probability: number;
  prevention_methods: string[]; // condoms, contraception, etc.
}

interface DiseaseRisk {
  disease_id: string;
  base_probability: number;
  modifiers: DiseaseRiskModifier[];
  prevention_effectiveness: number;
}
```

**Integration Tasks**:

- Disease system covers reproductive health (STD status, fertility)
- NSFW encounters can transmit diseases (risk calculation)
- Pregnancy system references Disease for complications
- Contraception methods integrate with Disease prevention mechanics

## Tasks

### Core Integration (High Priority)

- [ ] **G6: NSFW ↔ Housing Integration**
  - Map Housing location types to NSFWLocationType enum
  - Apply comfort/safety bonuses to NSFW encounter outcomes
  - Calculate discovery risk based on housing privacy
  - Support housing equipment as encounter modifiers

- [ ] **G7: NSFW ↔ Weather Integration**
  - Weather mood modifiers feed into NSFW mood system
  - Weather affects pheromone dispersion
  - Weather affects location availability for NSFW encounters
  - Seasonal effects on fertility cycles

- [ ] **G8: NSFW ↔ Social Integration**
  - Unified `ReputationScore` schema
  - Social skills as seduction prerequisites
  - NSFW reputation changes feed into Social
  - Social relationship tiers map to NSFW intimacy levels

- [ ] **G9: NSFW ↔ Disease Integration**
  - Disease system covers reproductive health
  - NSFW encounters can transmit diseases
  - Pregnancy system references Disease for complications
  - Contraception methods integrate with Disease prevention

### Safety & Moderation (High Priority)

- [ ] **Consent State Integration**
  - Unified `ConsentState` schema
  - Integration with Chat Lifecycle NSFW toggle
  - Audit trail for consent decisions
  - Revocation mechanism

- [ ] **NSFW Content Rating Enforcement**
  - 5-tier rating enum enforcement
  - Runtime enforcement at generation boundary
  - Content filtering based on rating
  - User preference override with warnings

## Implementation Notes

### Integration Strategy

1. **Start with Shared Schemas**
   - Define unified ReputationScore
   - Define ConsentState
   - Define NSFWContentRating enforcement

2. **Add Housing Integration**
   - Map location types
   - Apply comfort/safety modifiers
   - Calculate discovery risk

3. **Add Weather Integration**
   - Mood modifiers
   - Pheromone dispersion
   - Location availability

4. **Add Social Integration**
   - Reputation model
   - Skill prerequisites
   - Relationship mapping

5. **Add Disease Integration**
   - Reproductive health
   - Disease transmission
   - Pregnancy complications

### Technical Considerations

- **Privacy**: All NSFW data must respect user privacy settings
- **Compliance**: Content rating enforcement must be runtime-enforced
- **Performance**: Integration must not slow down encounter generation
- **Modularity**: Plugin system for custom NSFW content
- **Audit Trail**: All consent and moderation actions must be logged

## Files

- `src/nsfw/social-integration.ts` — Reputation and skills (canonical `ReputationScore` from `src/schemas/`)
- `src/middleware/nsfw-gate/consent.ts` — Consent state tracking (canonical `ConsentState` from `src/schemas/`)
- `src/schemas/reputation.ts` — Canonical reputation contract (tiers, modifiers, apply/decay)
- `src/schemas/consent.ts` — Canonical consent contract (audit trail, revocation)
- `src/schemas/nsfw-rating.ts` — Canonical rating enforcement contract
- `src/routes/nsfw.ts` — NSFW API endpoints
- `docs/spec/nsfw-integration.md` — Integration documentation

> **2026-08-15 dedup note**: housing/weather/disease integration scaffolding
> (`src/nsfw/{housing,weather}-integration.ts`, `src/nsfw/disease-integration/`,
> `src/nsfw/integration-schemas/`) was removed — zero production importers,
> divergent type shapes (directed camelCase `ReputationScore` vs canonical
> scalar snake_case). Build fresh against canonical schemas when wiring G6/G7/G9.

## Related Epics

- **Epic Character Core** — Traits, mood, relationships, NSFW rating
- **Epic Chat Lifecycle** — NSFW toggle, moderation
- **Epic Social Interaction** — Reputation, persuasion
- **Epic Disease & Poison** — Reproductive health, STDs
- **Epic Housing** — Private spaces, comfort
- **Epic Weather** — Environmental mood
- **Epic Economy** — NSFW item trading
- **Epic Plugin System** — Custom NSFW content
- **Epic Analytics** — NSFW metrics

## Linked Tasks

- `TASK-nsfw-integration-gaps.md`
- `TASK-nsfw-housing-integration.md`
- `TASK-nsfw-weather-integration.md`
- `TASK-nsfw-social-integration.md`
- `TASK-nsfw-disease-integration.md`
- `TASK-nsfw-consent-integration.md`
- `TASK-nsfw-rating-enforcement.md`

## Open Questions

### NSFW System Design

- How to handle consent revocation during encounters?
- Should NSFW content be plugin-based or core?
- How to balance NSFW mechanics with gameplay?
- What's the default NSFW content rating?

### Integration Complexity

- Should integration be tight (shared code) or loose (API calls)?
- How to handle performance-critical paths?
- Should there be fallback behavior when systems are unavailable?
- How to handle compatibility between different integration approaches?

### Safety & Compliance

- How to handle underage users?
- What's the content rating enforcement strategy?
- How to handle illegal content?
- What's the reporting mechanism?

## Implementation Phases

### Phase 1: Shared Schemas (High Priority)

- Unified ReputationScore schema
- ConsentState schema
- NSFWContentRating enforcement

### Phase 2: Housing Integration (Medium Priority)

- Location type mapping
- Comfort/safety modifiers
- Discovery risk calculation

### Phase 3: Weather Integration (Medium Priority)

- Mood modifiers
- Pheromone dispersion
- Location availability

### Phase 4: Social Integration (Medium Priority)

- Reputation model
- Skill prerequisites
- Relationship mapping

### Phase 5: Disease Integration (Medium Priority)

- Reproductive health
- Disease transmission
- Pregnancy complications

### Phase 6: Safety & Moderation (High Priority)

- Consent tracking
- Content rating enforcement
- Audit trails

## Success Metrics

- **Technical**
  - All NSFW systems integrated
  - Performance targets met
  - Plugin system functional
  - Safety systems working

- **Content**
  - 50+ intimacy actions
  - 20+ seduction skills
  - 10+ fantasy categories
  - 5+ pregnancy outcomes

- **Safety**
  - 100% consent tracking
  - Content rating enforcement
  - Audit trail complete
  - Moderation tools functional

## Related Resources

- [NSFW System Design Doc](docs/spec/nsfw.md)
- [Housing System Specs](docs/spec/nsfw-integration.md)
- [Weather System](docs/spec/weather-environment.md)
- [Social Interaction Design](docs/spec/social-interaction.md)
- [Disease System](docs/spec/disease-poison.md)
- [Character Core System](docs/spec/character-spec.md)
- [Chat Lifecycle & Moderation](docs/spec/chat-privacy.md)
- [Plugin System](docs/spec/plugin-system.md)
