<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Stealth & Crime Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Issue:** `2b7280b`
**Type:** Feature Epic
**Tags:** stealth, crime, thievery, bounties, law, detection

## Overview

Stealth and crime mechanics — sneaking, pickpocketing, lockpicking, crime detection, bounty system, law enforcement, and criminal underworld. Supports both player-driven crime and NPC criminal activity.

## Stealth System

### Stealth Mechanics

```typescript
interface StealthState {
  character_id: string;
  visibility: number; // 0-100 (0 = invisible, 100 = fully visible)
  noise_level: number; // 0-100
  detection_radius: number; // in feet
  stealth_level: number;
  modifiers: StealthModifier[];
  detected_by: DetectionRecord[];
}

interface StealthModifier {
  type: "light" | "noise" | "movement" | "equipment" | "skill" | "magic";
  value: number; // positive = more visible, negative = more hidden
  source: string;
}

interface DetectionRecord {
  detector_id: string;
  detection_type: "visual" | "audio" | "magical" | "intuition";
  confidence: number; // 0-100
  timestamp: Date;
  action_taken: "ignore" | "investigate" | "alert" | "attack";
}
```

### Stealth Actions

| Action           | Skill Check      | Detection Risk | Notes                   |
| ---------------- | ---------------- | -------------- | ----------------------- |
| **Sneak**        | DEX + Stealth    | Low            | Movement while hidden   |
| **Hide**         | DEX + Stealth    | None           | Become stationary       |
| **Pickpocket**   | DEX + Sleight    | Medium         | Steal from NPCs         |
| **Lockpick**     | DEX + Lockpick   | Low            | Open locked containers  |
| **Disable Trap** | INT + Trap       | Medium         | Neutralize traps        |
| **Eavesdrop**    | WIS + Perception | Low            | Listen to conversations |
| **Assassinate**  | DEX + Stealth    | High           | Silent kill attempt     |

### Detection System

```typescript
interface DetectionCheck {
  stealth_character: Character;
  detector: Character | NPC;
  distance: number;
  line_of_sight: boolean;
  lighting: LightingLevel;
  noise: number;
  stealth_skill: number;
  detection_skill: number;
  result: DetectionResult;
}

interface DetectionResult {
  detected: boolean;
  confidence: number; // 0-100
  alert_level: "none" | "suspicious" | "alert" | "combat";
  response: NPCResponse;
}
```

## Crime System

### Crime Types

| Crime             | Severity | Bounty    | Notes                     |
| ----------------- | -------- | --------- | ------------------------- |
| **Trespassing**   | Minor    | 10-50g    | Entering restricted areas |
| **Theft**         | Moderate | 50-200g   | Stealing items            |
| **Pickpocketing** | Moderate | 50-150g   | Stealing from NPCs        |
| **Assault**       | Serious  | 200-500g  | Attacking NPCs            |
| **Murder**        | Severe   | 500-2000g | Killing NPCs              |
| **Treason**       | Capital  | 5000g+    | Crimes against the state  |
| **Smuggling**     | Moderate | 100-300g  | Illegal goods             |
| **Trespassing**   | Minor    | 10-50g    | Restricted areas          |

### Crime Detection

```typescript
interface CrimeInstance {
  id: string;
  perpetrator_id: string;
  crime_type: CrimeType;
  location: WorldLocation;
  timestamp: Date;
  witnesses: Witness[];
  evidence: Evidence[];
  detected: boolean;
  bounty: number;
  investigation: Investigation;
}

interface Witness {
  npc_id: string;
  relationship: string;
  reliability: number; // 0-100
  silenced: boolean;
}

interface Evidence {
  type: "physical" | "testimony" | "magical" | "circumstantial";
  strength: number; // 0-100
  planted: boolean;
  discovered: boolean;
}
```

### Bounty System

```typescript
interface Bounty {
  id: string;
  target_id: string;
  crime_id: string;
  amount: number;
  issuer: "city" | "guild" | "player" | "faction";
  status: "active" | "claimed" | "expired" | "pardoned";
  hunters: BountyHunter[];
  expiry: Date;
}

interface BountyHunter {
  hunter_id: string;
  progress: number;
  reward_share: number;
}
```

## Lockpicking System

### Lock Complexity

| Lock Level    | Skill Required | Tools          | Time |
| ------------- | -------------- | -------------- | ---- |
| **Simple**    | 10             | Basic picks    | 5s   |
| **Easy**      | 25             | Standard picks | 10s  |
| **Medium**    | 40             | Quality picks  | 20s  |
| **Hard**      | 60             | Master picks   | 30s  |
| **Very Hard** | 80             | Expert picks   | 45s  |
| **Legendary** | 95             | Special picks  | 60s  |

### Lockpicking Mechanic

```typescript
interface LockpickAttempt {
  lock: Lock;
  pick: Lockpick;
  skill: number;
  difficulty: number;
  tension: number; // 0-100
  pins: Pin[];
  result: LockpickResult;
}

interface Pin {
  position: number;
  set: boolean;
  difficulty: number;
  spring_strength: number;
}

interface LockpickResult {
  success: boolean;
  time_taken: number;
  pick_broken: boolean;
  lock_damaged: boolean;
  noise_generated: number;
}
```

## Pickpocketing System

### Pickpocket Targets

```typescript
interface PickpocketTarget {
  npc_id: string;
  inventory: InventoryItem[];
  awareness: number; // 0-100
  pockets: Pocket[];
  valuables: ValuableItem[];
}

interface Pocket {
  location: "front" | "back" | "belt" | "bag" | "hidden";
  items: InventoryItem[];
  difficulty: number;
  discovered: boolean;
}
```

### Pickpocket Mechanics

```typescript
interface PickpocketAttempt {
  thief: Character;
  target: NPC;
  item: InventoryItem;
  skill: number;
  distraction: boolean;
  result: PickpocketResult;
}

interface PickpocketResult {
  success: boolean;
  item_stolen: boolean;
  detected: boolean;
  chase_initiated: boolean;
  bounty_added: number;
}
```

## Law Enforcement

### Guard System

```typescript
interface Guard {
  npc_id: string;
  patrol_route: PatrolPoint[];
  alert_level: number; // 0-100
  detection_radius: number;
  response_time: number; // seconds
  force_level: "verbal" | "arrest" | "lethal";
}

interface GuardResponse {
  crime: CrimeInstance;
  guards_alerted: Guard[];
  response_type: "investigate" | "pursue" | "arrest" | "attack" | "ignore";
  pursuit_duration: number;
  escape_chance: number;
}
```

### Jail System

```typescript
interface JailSentence {
  character_id: string;
  crime: CrimeType;
  duration: number; // in game hours
  bail_amount: number;
  cell: JailCell;
  activities: JailActivity[];
  escape_attempts: EscapeAttempt[];
}
```

## Criminal Underworld

### Thieves Guild

```typescript
interface ThievesGuild {
  id: string;
  name: string;
  reputation: number; // 0-100
  ranks: GuildRank[];
  missions: GuildMission[];
  contacts: NPCContact[];
  safe_houses: SafeHouse[];
  black_market: BlackMarket;
}
```

### Black Market

```typescript
interface BlackMarket {
  location: WorldLocation;
  inventory: BlackMarketItem[];
  reputation_required: number;
  prices: PriceModifier[];
  special_services: Service[];
}

interface BlackMarketItem {
  item: Item;
  base_price: number;
  availability: number; // 0-100
  reputation_discount: number;
}
```

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| RPG Mechanics | Stats (DEX, INT, WIS), skill checks | Stealth/crime skill resolution |
| NPC System | Awareness, reactions, memory | Guard detection, NPC witness state |
| World & Locations | Restricted areas, guard patrols | Crime scenes, restricted zones |
| Economy & Trading | Bounties, fines, black market | Crime financial consequences (G12) |
| Social Interaction | Reputation, deception skills | Criminal reputation feeds social standing; deception/disguise aid crime (G13) |
| Faction & Reputation | Law enforcement, criminal factions | Faction-aligned crime, reputation impacts |
| Battle & Action Systems | Stealth attacks, pursuit combat | Stealth engagement, escape combat |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| RPG Mechanics | Crime skill checks | Stealth rolls via unified skill model |
| Economy & Trading | Stolen goods, black market | Stolen items enter economy (G12) |
| Social Interaction | Criminal reputation | Reputation flows into social standing (G13) |
| Faction & Reputation | Law enforcement standing | Crime lowers law reputation, raises criminal faction |
| Battle & Action Systems | Stealth engagement rules | Ambush/pursuit mechanics |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `SkillCheck` | Resolution, RPG, Social | Stealth/deception rolls use unified model |
| `Bounty` | Economy, Faction | Shared bounty/fine contract |
| `ReputationScore` | Social, Faction | Criminal standing consistency (G13/G14) |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `crime.commit` | emits → Faction, Economy, Social | Crime affects faction standing, bounties, reputation |
| `crime.witnessed` | emits → NPC, Faction | Witness awareness updates guard state |
| `resolution.roll` | subscribes ← Resolution | Stealth checks flow through unified resolver |

---

## Open Questions

- Should crime be permanently recorded or decay over time?
- How to handle accidental crimes (friendly fire, collateral)?
- Should there be a "crime pays" risk/reward balance?
- How to prevent crime system abuse (griefing)?
- Should stealth be viable for all character builds?

## Files

- `src/rpg/stealth/` — stealth system
- `src/rpg/crime/` — crime system
- `src/rpg/stealth/detection.ts` — detection mechanics
- `src/rpg/stealth/actions.ts` — stealth actions
- `src/rpg/crime/bounty.ts` — bounty system
- `src/rpg/crime/lockpicking.ts` — lockpicking
- `src/rpg/crime/pickpocket.ts` — pickpocketing
- `src/rpg/crime/law.ts` — law enforcement
- `src/rpg/crime/underworld.ts` — criminal underworld
- `src/db/schema-crime.ts` — crime tables
- `src/routes/crime.ts` — crime API

## Related Epics

- **Epic RPG Mechanics** — Stats, skills
- **Epic World & Locations** — Restricted areas
- **Epic NPC System** — NPC awareness, reactions
- **Epic Economy System** — Bounties, fines
- **Social Interaction** — Criminal reputation feeds into social standing; social skills (deception, disguise) aid crime
- **Epic Faction System** — Law enforcement

## Linked Tasks

- TASK-stealth-crime.md
