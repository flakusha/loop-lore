# EPIC: Weather & Environmental Effects

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** weather, environment, effects, climate, terrain, hazards

## Overview

Weather and environmental mechanics — dynamic weather systems, terrain effects, environmental hazards, climate zones, and gameplay impact. Integrates with world conditions and combat systems.

## Weather System

### Weather Types

| Type | Effects | Duration | Frequency |
|------|---------|----------|-----------|
| **Clear** | None | Variable | Common |
| **Cloudy** | Minor visibility | Hours | Common |
| **Rain** | Movement slow, fire weakness | Hours | Common |
| **Storm** | Lightning, flooding, visibility | Hours | Uncommon |
| **Snow** | Movement slow, cold damage | Hours-days | Seasonal |
| **Blizzard** | Severe cold, visibility, movement | Hours | Rare |
| **Fog** | Major visibility reduction | Hours | Uncommon |
| **Sandstorm** | Visibility, damage, navigation | Hours | Rare |
| **Heatwave** | Stamina drain, fire bonus | Days | Rare |
| **Magical Storm** | Wild magic, elemental surges | Hours | Very rare |

### Weather Structure

```typescript
interface WeatherState {
  current: WeatherType;
  intensity: number; // 0-100
  duration: number; // in minutes
  transition: WeatherTransition;
  effects: WeatherEffect[];
  visibility: number; // 0-100
  temperature: number; // -50 to 50
  wind_speed: number; // 0-100
  precipitation: number; // 0-100
}

interface WeatherEffect {
  type: 'movement' | 'combat' | 'magic' | 'visibility' | 'stamina' | 'damage' | 'healing';
  modifier: number;
  element?: Element;
  condition?: string;
}

interface WeatherTransition {
  from: WeatherType;
  to: WeatherType;
  progress: number; // 0-100
  transition_time: number; // in minutes
}
```

### Weather Generation

```typescript
interface WeatherGenerator {
  climate: ClimateZone;
  season: Season;
  time_of_day: TimeOfDay;
  elevation: number;
  proximity_to_water: number;
  magical_influence: number;
  forecast: WeatherForecast[];
}

interface WeatherForecast {
  time: Date;
  weather: WeatherType;
  intensity: number;
  confidence: number; // 0-100
}
```

## Climate Zones

### Zone Types

| Zone | Temperature | Weather Patterns | Terrain |
|------|-------------|------------------|---------|
| **Tropical** | Hot, humid | Rain, storms, monsoons | Jungle, beach |
| **Arid** | Hot, dry | Sandstorms, heatwaves | Desert, canyon |
| **Temperate** | Moderate | Rain, snow, clear | Forest, plains |
| **Continental** | Variable | Snow, storms, clear | Mountains, hills |
| **Polar** | Cold | Blizzards, snow, ice | Tundra, glacier |
| **Magical** | Variable | Magical storms, anomalies | Enchanted areas |

### Climate Structure

```typescript
interface ClimateZone {
  id: string;
  name: string;
  type: ClimateType;
  temperature_range: [number, number];
  precipitation_range: [number, number];
  seasonal_variations: SeasonalVariation[];
  weather_probabilities: WeatherProbability[];
  hazards: EnvironmentalHazard[];
}

interface SeasonalVariation {
  season: Season;
  temperature_modifier: number;
  precipitation_modifier: number;
  weather_bias: WeatherType[];
}
```

## Terrain Effects

### Terrain Types

| Type | Movement | Combat | Special |
|------|----------|--------|---------|
| **Plains** | Normal | Normal | Open field |
| **Forest** | Slowed | Cover bonus | Stealth bonus |
| **Mountains** | Difficult | High ground | Climbing required |
| **Swamp** | Very slow | Poison risk | Disease risk |
| **Desert** | Normal | Heat stress | Water drain |
| **Snow** | Slowed | Cold damage | Frostbite risk |
| **Water** | Swimming | Penalties | Drowning risk |
| **Underground** | Variable | Darkness | Claustrophobia |

### Terrain Structure

```typescript
interface Terrain {
  id: string;
  name: string;
  type: TerrainType;
  movement_cost: number; // multiplier
  combat_modifier: CombatModifier;
  stealth_modifier: number;
  visibility: number; // 0-100
  hazards: TerrainHazard[];
  resources: ResourceNode[];
  cover_value: number; // 0-100
}

interface TerrainHazard {
  type: 'damage' | 'movement' | 'status' | 'environmental';
  severity: number; // 1-10
  trigger_chance: number; // 0-100
  effect: HazardEffect;
}
```

## Environmental Hazards

### Hazard Types

| Type | Effect | Avoidance |
|------|--------|-----------|
| **Lava** | Fire damage | Fire resistance, flight |
| **Acid Pool** | Acid damage | Acid resistance, avoidance |
| **Quicksand** | Entrapment | DEX check, rope |
| **Poison Gas** | Poison damage | Gas mask, CON save |
| **Electrified** | Lightning damage | Lightning resistance |
| **Radiation** | Gradual damage | Protection gear |
| **Wild Magic** | Random effects | Magic resistance |
| **Gravity** | Movement/change | Strength/magic |

### Hazard Structure

```typescript
interface EnvironmentalHazard {
  id: string;
  name: string;
  type: HazardType;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  damage_per_round: number;
  status_effects: StatusEffect[];
  trigger_radius: number;
  avoidance_dc: number;
  resistance_type: Element;
  visual_effects: VisualEffect[];
  audio_effects: AudioEffect[];
}
```

## Environmental Gameplay Effects

### Combat Effects

```typescript
interface EnvironmentalCombatModifier {
  weather: WeatherType;
  terrain: TerrainType;
  effects: CombatEffect[];
}

interface CombatEffect {
  type: 'attack' | 'defense' | 'damage' | 'magic' | 'movement' | 'initiative';
  element?: Element;
  modifier: number;
  condition?: string;
}
```

### Weather Combat Modifiers

| Weather | Ranged | Magic | Fire | Ice | Lightning | Movement |
|---------|--------|-------|------|-----|-----------|----------|
| **Rain** | -10% | Normal | -20% | +10% | +20% | -10% |
| **Storm** | -25% | -10% | -30% | +20% | +50% | -25% |
| **Snow** | -15% | Normal | -10% | +30% | Normal | -20% |
| **Fog** | -30% | Normal | Normal | Normal | Normal | -10% |
| **Sandstorm** | -40% | -20% | +10% | -10% | -20% | -30% |
| **Heatwave** | Normal | Normal | +30% | -30% | Normal | -15% |

### Exploration Effects

```typescript
interface ExplorationModifier {
  weather: WeatherType;
  terrain: TerrainType;
  effects: ExplorationEffect[];
}

interface ExplorationEffect {
  type: 'visibility' | 'navigation' | 'gathering' | 'stealth' | 'travel_speed';
  modifier: number;
  skill_check_dc?: number;
}
```

## Day/Night Cycle

### Time Periods

| Period | Light Level | Effects |
|--------|-------------|---------|
| **Dawn** | Low → Medium | Transition, special events |
| **Day** | Full | Normal visibility |
| **Dusk** | Medium → Low | Transition, special events |
| **Night** | Low | Stealth bonus, undead bonus |
| **Midnight** | Very Low | Special events, magic bonus |
| **Twilight** | Variable | Magical effects |

### Time Structure

```typescript
interface GameTime {
  hour: number; // 0-23
  minute: number; // 0-59
  day: number;
  month: number;
  year: number;
  season: Season;
  time_of_day: TimeOfDay;
  moon_phase: MoonPhase;
}

interface MoonPhase {
  phase: 'new' | 'waxing_crescent' | 'first_quarter' | 'waxing_gibbous' | 'full' | 'waning_gibbous' | 'last_quarter' | 'waning_crescent';
  effects: MoonEffect[];
}
```

## Seasonal Effects

### Season Modifiers

```typescript
interface SeasonalEffects {
  season: Season;
  weather_bias: WeatherProbability[];
  temperature_modifier: number;
  daylight_hours: number;
  resource_availability: ResourceModifier[];
  creature_behavior: CreatureModifier[];
  special_events: SeasonalEvent[];
}
```

### Seasonal Events

| Season | Events | Effects |
|--------|--------|---------|
| **Spring** | Blooming, rain | Herb growth, flooding |
| **Summer** | Heat, storms | Fire risk, growth |
| **Autumn** | Harvest, wind | Resource gathering |
| **Winter** | Snow, blizzards | Cold damage, scarcity |

## Magical Environment

### Magical Weather

```typescript
interface MagicalWeather {
  type: 'wild_magic' | 'elemental_surge' | 'arcane_storm' | 'divine_light' | 'shadow_fall';
  intensity: number; // 0-100
  effects: MagicalEffect[];
  duration: number;
  trigger_conditions: TriggerCondition[];
}

interface MagicalEffect {
  type: 'spell_boost' | 'spell_failure' | 'random_effect' | 'elemental_change' | 'summon';
  element?: Element;
  magnitude: number;
  target: 'self' | 'area' | 'world';
}
```

## Integration Points

- **World & Locations** — Climate zones, terrain
- **Combat System** — Environmental modifiers
- **Magic System** — Magical weather, elemental effects
- **Exploration System** — Travel, navigation
- **NPC System** — NPC behavior affected by weather
- **Crafting System** — Weather-dependent recipes

## Open Questions

- Should weather be predictable or random?
- How to handle weather in instanced content?
- Should weather affect all players equally?
- How to balance weather penalties vs. fun?
- Should weather be controllable by players?

## Files

- `src/rpg/weather/` — weather system
- `src/rpg/environment/` — environment system
- `src/rpg/weather/generator.ts` — weather generation
- `src/rpg/weather/effects.ts` — weather effects
- `src/rpg/weather/climate.ts` — climate zones
- `src/rpg/environment/terrain.ts` — terrain effects
- `src/rpg/environment/hazards.ts` — environmental hazards
- `src/rpg/environment/time.ts` — day/night cycle
- `src/rpg/environment/seasons.ts` — seasonal effects
- `src/db/schema-weather.ts` — weather tables
- `src/routes/weather.ts` — weather API

## Related Epics

- **Epic World & Locations** — World conditions, terrain
- **Epic Combat System** — Environmental modifiers
- **Epic Magic System** — Magical weather
- **Epic Exploration System** — Travel, navigation
- **Epic NPC System** — NPC behavior
