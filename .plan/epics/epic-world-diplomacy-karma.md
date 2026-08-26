<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: World Diplomacy & Karma

**Status:** Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** world, factions, diplomacy, karma, reputation
**Parent Epic:** World & Locations (epic-world-locations.md)

## Summary

Factions, reputation/karma systems, lore-following quality, and world state management for loop-lore.

## Sub-Epic of

Part of the **World & Locations** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- Faction structure and membership
- Reputation and karma tracking
- Lore-following quality system
- World state management (global memory, cross-group impact, evolution)
- Diplomacy options and consequences
- Peace/war state management
- Message formatting and language

## Key Integrations

- Social Interaction: faction reputation, social dynamics
- Economy: faction markets, trade restrictions
- Battle: faction alliances in combat, war declarations
- NPC: faction membership, diplomatic NPCs
- Character: karma-based quest availability

## Tasks

- [ ] Implement lore following/quality investigation
- [ ] Implement diplomacy system
- [ ] Implement karma and standing system
- [ ] Implement message formatting system
- [ ] Implement slang/dialect system
- [ ] Implement NPC speech patterns
- [ ] Implement world-specific terminology
- [ ] Implement global memory system
- [ ] Implement cross-group impact system
- [ ] Implement time lag system
- [ ] Implement reputation spillover
- [ ] Implement world state evolution
- [ ] Implement consequence propagation
- [ ] Implement game-inspired systems (radiant quests, crime/bounty, faction reputation, etc.)
- [ ] Create diplomacy UI
- [ ] Create karma/standing UI
- [ ] Create global memory UI

## Design

### Diplomacy System

```typescript
interface DiplomacySystem {
  factions: Faction[];
  relationships: FactionRelationship[];
  diplomaticActions: DiplomaticAction[];
  alliances: Alliance[];
  wars: War[];
}

interface Faction {
  id: string;
  name: string;
  description: string;
  alignment: Alignment;
  values: FactionValue[];
  territory: string[];
  leaders: string[]; // NPC IDs
  members: string[]; // NPC IDs
}

interface FactionRelationship {
  factionA: string;
  factionB: string;
  standing: number; // -100 to 100
  status: "allied" | "friendly" | "neutral" | "unfriendly" | "hostile" | "at_war";
  history: RelationshipEvent[];
}

interface DiplomaticAction {
  id: string;
  name: string;
  type: "negotiate" | "bribe" | "threaten" | "ally" | "declare_war" | "peace_treaty" | "trade_agreement";
  requirements: DiplomaticRequirement[];
  effects: DiplomaticEffect[];
  consequences: DiplomaticConsequence[];
}

interface Alliance {
  id: string;
  factions: string[];
  type: "defensive" | "offensive" | "trade" | "research";
  terms: AllianceTerms;
  status: "active" | "broken" | "proposed";
  duration: number; // world time seconds
}
```

### Karma & Standing System

```typescript
interface KarmaSystem {
  characterKarma: CharacterKarma;
  factionStanding: FactionStanding[];
  worldReputation: WorldReputation;
  karmaEffects: KarmaEffect[];
}

interface CharacterKarma {
  overall: number; // -100 (evil) to 100 (good)
  categories: KarmaCategory[];
  history: KarmaEvent[];
  tier: KarmaTier;
}

interface KarmaCategory {
  name: string;
  value: number; // -100 to 100
  description: string;
}

interface KarmaTier {
  name: string; // 'saint', 'hero', 'neutral', 'villain', 'tyrant'
  threshold: number;
  effects: KarmaTierEffect[];
}

interface FactionStanding {
  factionId: string;
  standing: number; // -100 to 100
  tier: StandingTier;
  history: StandingEvent[];
  questsCompleted: number;
  questsFailed: number;
  itemsTraded: number;
  enemiesKilled: number;
}

interface StandingTier {
  name: string; // 'exalted', 'revered', 'honored', 'friendly', 'neutral', 'unfriendly', 'hostile'
  threshold: number;
  effects: StandingTierEffect[];
}

interface WorldReputation {
  overall: number; // -100 to 100
  categories: ReputationCategory[];
  titles: string[];
  achievements: string[];
}

interface KarmaEffect {
  type: "npc_reaction" | "quest_availability" | "item_access" | "price_modifier" | "world_state";
  condition: KarmaCondition;
  effect: KarmaEffectValue;
}
```

### Global Memory & Cross-Group Impact System

```typescript
interface GlobalMemory {
  worldId: string;
  memories: GlobalMemoryEntry[];
  crossGroupImpacts: CrossGroupImpact[];
  timeLags: TimeLag[];
  reputationSpillover: ReputationSpillover[];
  worldStateEvolution: WorldStateEvolution[];
}

interface GlobalMemoryEntry {
  id: string;
  type: "player_action" | "world_event" | "cataclysm" | "diplomatic" | "economic";
  content: string;
  timestamp: Date;
  importance: number; // 0-100
  participants: string[]; // group/character IDs
  location: string;
  worldStateChange: WorldStateChange;
  propagationDelay: number; // world time seconds
}

interface CrossGroupImpact {
  sourceGroupId: string;
  targetGroupId: string;
  impactType: "reputation" | "resource" | "access" | "hostility" | "alliance";
  magnitude: number; // -100 to 100
  delay: number; // world time seconds
  conditions: ImpactCondition[];
  propagationPath: string[]; // location IDs
}

interface TimeLag {
  eventId: string;
  actualImpactTime: Date;
  perceivedImpactTime: Date;
  lagDuration: number; // world time seconds
  lagReason: string;
  propagationFactors: PropagationFactor[];
}

interface ReputationSpillover {
  sourceGroup: string;
  targetGroup: string;
  spilloverType: "positive" | "negative" | "neutral";
  magnitude: number; // 0-100
  decayRate: number; // per world time hour
  conditions: SpilloverCondition[];
}

interface WorldStateEvolution {
  evolutionType: "gradual" | "sudden" | "cascading" | "cyclical";
  triggers: EvolutionTrigger[];
  changes: EvolutionChange[];
  timeline: EvolutionTimeline[];
  reversibility: boolean;
}
```

### Global Consequence Propagation

```typescript
interface ConsequencePropagation {
  sourceEvent: string;
  propagationChain: PropagationStep[];
  finalImpact: FinalImpact;
  totalDelay: number; // world time seconds
  visibility: "immediate" | "delayed" | "hidden";
}

interface PropagationStep {
  stepNumber: number;
  location: string;
  delay: number; // world time seconds
  effect: PropagationEffect;
  amplification: number; // 0-2 (1 = normal)
  dampening: number; // 0-1 (1 = fully dampened)
}

interface FinalImpact {
  location: string;
  effect: string;
  magnitude: number; // 0-100
  duration: number; // world time seconds
  reversibility: boolean;
  recoveryActions: string[];
}
```

### Message Formatting System

```typescript
interface MessageFormatting {
  worldId: string;
  style: WorldStyle;
  language: LanguageConfig;
  npcSpeech: NPCSpeechConfig;
  formatting: FormattingRules;
}

interface LanguageConfig {
  level: "formal" | "casual" | "archaic" | "slang" | "technical" | "poetic";
  dialect: string;
  slang: SlangDictionary;
  idioms: IdiomDictionary;
  culturalReferences: CulturalReference[];
  terminology: TerminologySet;
}

interface SlangDictionary {
  [word: string]: {
    meaning: string;
    usage: "common" | "rare" | "archaic" | "regional";
    context: string;
    alternatives: string[];
  };
}

interface IdiomDictionary {
  [idiom: string]: {
    meaning: string;
    origin: string;
    usage: string;
    alternatives: string[];
  };
}

interface CulturalReference {
  id: string;
  name: string;
  description: string;
  usage: string;
  context: string;
  alternatives: string[];
}

interface TerminologySet {
  [term: string]: {
    definition: string;
    category: string;
    synonyms: string[];
    antonyms: string[];
    usage: string;
  };
}

interface NPCSpeechConfig {
  patterns: SpeechPattern[];
  vocabulary: VocabularyLevel;
  grammar: GrammarRules;
  pronunciation: PronunciationRules;
  accent: AccentConfig;
}

interface SpeechPattern {
  id: string;
  name: string;
  pattern: string; // regex or template
  usage: "common" | "rare" | "archaic" | "regional";
  context: string;
  examples: string[];
}

interface VocabularyLevel {
  level: "simple" | "moderate" | "complex" | "archaic" | "technical";
  wordChoice: "common" | "formal" | "slang" | "poetic";
  sentenceStructure: "simple" | "complex" | "mixed";
}

interface GrammarRules {
  tense: "past" | "present" | "future" | "mixed";
  person: "first" | "second" | "third" | "mixed";
  formality: "formal" | "casual" | "mixed";
  contractions: boolean;
  slang: boolean;
}

interface PronunciationRules {
  accent: string;
  emphasis: "standard" | "regional" | "foreign";
  mispronunciations: string[];
  speechImpediments: string[];
}

interface AccentConfig {
  type: "standard" | "regional" | "foreign" | "fictional";
  name: string;
  description: string;
  examples: string[];
}

interface FormattingRules {
  messageLength: "short" | "medium" | "long" | "variable";
  punctuation: "standard" | "minimal" | "excessive";
  capitalization: "standard" | "all_caps" | "lowercase" | "mixed";
  emojis: boolean;
  abbreviations: boolean;
  slang: boolean;
}
```

## Dependencies

- **Parent hub:** `epic-world-locations.md` — owns the shared World/Location core data model.
- **Sibling order:** last in sequencing; depends on `epic-world-npcs.md` (faction membership, NPC standing) and `epic-world-travel-time.md` infrastructure.

## Open Questions

- How does karma reset or decay over time?
- Can factions go to war and what happens toneutral factions?
- How does lore quality affect world progression?
