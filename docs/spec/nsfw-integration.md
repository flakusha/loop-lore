# NSFW Integration Gaps — Housing, Weather, Social, Disease

## Overview

The NSFW epic (`epic-nsfw-game-mechanics.md`, 848 lines) defines 8 gameplay systems but has zero cross-references to Housing, Weather, Social, or Disease systems. This spec tracks the integration work to close these gaps.

## Current State Assessment

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
| `housing.privacy.level.changed` | subscrices | Update encounter discovery risk            |
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

## Files

- `src/nsfw/housing-integration.ts` — Housing privacy and comfort
- `src/nsfw/weather-integration.ts` — Weather mood and pheromones
- `src/nsfw/social-integration.ts` — Reputation and skills
- `src/nsfw/disease-integration.ts` — Reproductive health and STDs
- `src/nsfw/consent.ts` — Consent state tracking
- `src/nsfw/rating.ts` — Content rating enforcement
- `src/db/schema-nsfw.ts` — NSFW database tables
- `src/routes/nsfw.ts` — NSFW API endpoints
- `docs/spec/nsfw-integration.md` — Integration documentation

## Technical Considerations

- **Privacy**: All NSFW data must respect user privacy settings
- **Compliance**: Content rating enforcement must be runtime-enforced
- **Performance**: Integration must not slow down encounter generation
- **Modularity**: Plugin system for custom NSFW content
- **Audit Trail**: All consent and moderation actions must be logged

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
- [Weather System](docs/spec/weather-environment.md)
- [Social Interaction Design](docs/spec/social-interaction.md)
- [Disease System](docs/spec/disease-poison.md)
- [Character Core System](docs/spec/character-spec.md)
- [Chat Lifecycle & Moderation](docs/spec/messages.md)
- [Plugin System](docs/spec/plugin-system.md)
