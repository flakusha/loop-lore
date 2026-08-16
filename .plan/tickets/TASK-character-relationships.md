<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-050: Character Relationships Graph

**Status**: open
**Priority**: medium
**Labels**: feature, characters, relationships
**Assignee**:
**Epic**: EPIC-059 (Creative Studio)

## Description

Character relationships as a graph system. Supports NPC-to-NPC and character-to-character relationships with strength, opinion, and status.

### Relationships Reference

**Relationship Structure**

```toml
[[permanent.relationships]]
target_id = "npc_002"
target_name = "Captain Vane"
type = "professional"
sub_type = "superior"
flow = "directional" # "directional" or "mutual"
strength = 0.85 # 0.0 (estranged) to 1.0 (bonded)
opinion = 75 # -100 (hatred) to 100 (adoration)
status = "active" # "active", "past", "secret"
tags = ["owes_favor", "knows_secret"]
```

**Quest Generation Hooks**

```toml
[permanent.quest_generation]
motivations = { security = 8, pleasure = 3, greed = 6, knowledge = 9, revenge = 2 }
observers = [
  { id = "field_security", type = "count", target = "hostiles", threshold = 0 },
]
quest_assets = [
  { id = "wolf_spawner", motivation_match = "security", difficulty = 5 },
]
```

### Acceptance Criteria

- [ ] Add `character_relationships` DB table
- [ ] Relationship graph queries (by target, by strength, by type)
- [ ] Integrate with mood system (relationship affects behavior)
- [ ] Quest generation hooks based on relationships

### Notes

Relationships affect:

- Dialogue options
- Quest availability
- Combat behavior
- Trade prices
- Information sharing

Graph-based queries needed for:

- "Who does this NPC trust?"
- "What are the strongest bonds in this chat?"
- "Which characters have secret relationships?"

### Dynamic Relationship Evolution (Extension — Research-Driven)

Relationships are not static — they evolve through interactions, events,
and time. The system must support automatic relationship changes based on
character behavior and world events.

#### Relationship Events

Events that modify relationships:

```typescript
interface RelationshipEvent {
  id: string;
  source_id: string;         // who triggered the event
  target_id: string;         // who is affected
  event_type: RelationshipEventType;
  timestamp: Date;
  location?: string;
  description: string;
  
  // Impact
  strength_change: number;   // -100 to 100
  opinion_change: number;    // -100 to 100
  
  // Context
  witnessed_by?: string[];   // who saw this happen
  secret: boolean;           // is this event hidden from others?
}

type RelationshipEventType =
  | "positive_interaction"   // helped, praised, supported
  | "negative_interaction"   // insulted, betrayed, harmed
  | "shared_experience"      // fought together, survived together
  | "gift_given"             // gave a gift or favor
  | "gift_received"          // received a gift or favor
  | "secret_shared"          // told a secret
  | "secret_broken"          // revealed a secret
  | "conflict"               // direct confrontation
  | "resolution"             // resolved a conflict
  | "time_decay"             // relationship weakened over time
  | "world_event"            // shared world event (war, disaster, celebration)
  | "proximity"              // spent time together
  | "separation"             // spent time apart
  | "betrayal"               // major betrayal event
  | "sacrifice"              // made a sacrifice for the other
  | "rivalry"                // competing for same goal/resource
  | "alliance"               // formed an alliance against common threat
  | "romance"                // romantic development
  | "rejection"              // romantic/social rejection
  | "forgiveness"            // forgiven for past wrongs
  | "grudge"                 // held grudge from past wrongs;
```

#### Relationship Decay

Relationships decay over time without interaction:

```typescript
interface RelationshipDecayConfig {
  enabled: boolean;
  decay_rate: number;          // strength loss per day without interaction
  minimum_strength: number;    // floor (e.g. 0 = can become strangers)
  recovery_rate: number;       // how fast relationships recover with interaction
  
  // Decay modifiers
  relationship_type_modifiers: Record<string, number>; // e.g. "family": 0.5 (slower decay)
  proximity_modifiers: Record<string, number>;         // e.g. "same_location": 0.3 (slower)
}
```

#### Relationship Milestones

Significant relationship thresholds that trigger events:

```typescript
interface RelationshipMilestone {
  id: string;
  name: string;
  threshold: number;           // strength level to trigger
  direction: "positive" | "negative";
  
  // Effects
  effects: {
    dialogue_options?: string[];     // new dialogue available
    quest_unlocks?: string[];        // new quests available
    behavior_changes?: string[];     // NPC behavior changes
    relationship_type_change?: string; // e.g. "friend" → "ally"
  };
  
  // Notification
  notify_player: boolean;
  notification_message?: string;
}
```

#### Relationship Types Evolution

Relationships can change type over time:

```typescript
interface RelationshipTypeTransition {
  from_type: string;
  to_type: string;
  conditions: {
    min_strength: number;
    min_opinion: number;
    required_events?: string[];  // e.g. ["shared_experience", "sacrifice"]
    required_time_days?: number;
  };
}
```

#### Integration with Memory System

Relationship events are stored in episodic memory and influence future
interactions:

1. **Event memory** — relationship events are stored with emotional valence
2. **Pattern recognition** — repeated events create semantic facts
   (e.g. "Character A often helps Character B")
3. **Grudge tracking** — negative events create lasting memories that
   influence future interactions
4. **Forgiveness mechanics** — positive events can gradually reduce grudge
   strength

#### Prompt Assembly

When generating dialogue or behavior, the prompt includes:
1. **Current relationship state** — type, strength, opinion
2. **Recent events** — what happened between them recently
3. **Grudge/forgiveness** — any outstanding grudges or forgiveness
4. **Milestone effects** — what dialogue/behavior changes are unlocked

#### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-relationship-events | Relationship event system with typed events | High | Not Started |
| TASK-relationship-decay | Time-based relationship decay | Medium | Not Started |
| TASK-relationship-milestones | Relationship milestone thresholds | Medium | Not Started |
| TASK-relationship-type-evolution | Dynamic relationship type transitions | Medium | Not Started |
| TASK-relationship-memory | Integration with memory system | High | Not Started |
| TASK-relationship-prompt | Prompt assembly for relationship context | High | Not Started |
| TASK-relationship-tests | Events, decay, milestones, evolution tests | High | Not Started |

#### Open Questions

1. Should relationship decay be visible to players, or only noticeable through behavior?
2. How should NPCs handle conflicting relationship events (positive and negative)?
3. Should relationship milestones be automatic, or require player/NPC action?
4. How should relationship evolution scale with world size?
5. Should NPCs be able to have multiple relationship types with the same character?
