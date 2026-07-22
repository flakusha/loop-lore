# TASK: Character Relationships

**Epic:** Character Core System
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Define and track relationships between characters — allies, rivals, family, romantic, etc. Affects dialogue tone, group chat dynamics, mood, and story generation. Relationships are per-world.

## Design

### Relationship Types

```typescript
type RelationshipType =
  | "ally" // Cooperative, trust
  | "rival" // Competitive, respect
  | "family" // Blood relation
  | "romantic" // Love interest
  | "mentor" // Teacher/student
  | "student" // Learner
  | "enemy" // Active hostility
  | "neutral" // No strong feelings
  | "acquaintance" // Known but not close
  | "custom"; // User-defined
```

### Relationship Schema

```typescript
interface CharacterRelationship {
  id: string;
  from_actor_id: string;
  to_actor_id: string;
  world_id: string; // Relationships are per-world

  // Core relationship
  type: RelationshipType;
  strength: number; // -100 to +100 (negative = antagonistic)
  description?: string; // "Childhood friends", "Sworn enemies"
  custom_type?: string; // For custom relationship types

  // Interaction tracking
  last_interaction_at: Date;
  interaction_count: number;
  positive_interactions: number;
  negative_interactions: number;

  // Context
  context: string; // How they met, shared history
  secrets_known: string[]; // What each knows about the other

  // Mood integration
  mood_impact: number; // How much this relationship affects mood (-50 to +50)
  mood_recovery_modifier: number; // Multiplier for mood recovery (0.5-2.0)

  // Metadata
  created_at: Date;
  updated_at: Date;
}
```

### Relationship Tiers

| Tier       | Range    | Effect                                     |
| ---------- | -------- | ------------------------------------------ |
| Hostile    | -100–-51 | Attack on sight, refuse cooperation        |
| Unfriendly | -50–-21  | Cold, suspicious, limited interaction      |
| Neutral    | -20–+20  | Default, no strong feelings                |
| Friendly   | +21–+50  | Cooperative, willing to help               |
| Allied     | +51–+75  | Deep trust, share resources freely         |
| Devoted    | -76–+100 | Unconditional loyalty, sacrifice for other |

### Relationship Events

Standing shifts based on events:

| Event                      | Standing Change |
| -------------------------- | --------------- |
| Successful trade           | +5              |
| Failed trade (cheated)     | -15             |
| Gift given                 | +10             |
| Gift refused               | -5              |
| Combat (defeated opponent) | -20             |
| Combat (spared opponent)   | +10             |
| Saved from danger          | +25             |
| Betrayed trust             | -30             |
| Shared information         | +5              |
| Kept secret                | +10             |
| Completed quest for them   | +15             |
| Failed quest for them      | -10             |
| Insulted publicly          | -10             |
| Complimented publicly      | +5              |
| Spent time together        | +3              |
| Ignored/rejected           | -5              |
| Defended in argument       | +8              |
| Criticized publicly        | -8              |

### Relationship Effects

Relationships affect:

1. **Dialogue Tone** — How characters speak to each other
2. **Group Chat Dynamics** — Turn selection, interaction patterns
3. **Mood** — Relationship events affect happiness
4. **Story Generation** — Narrative choices based on bonds
5. **Avatar Selection** — Relationship context for avatar choice
6. **Memory Injection** — Relationship-relevant memories prioritized

### Bidirectional Relationships

Relationships are NOT automatically bidirectional:

- A→B can differ from B→A
- Example: A admires B (+60), B is neutral toward A (+10)
- Exception: Family relationships can be forced bidirectional

```typescript
interface BidirectionalRelationship {
  forward: CharacterRelationship; // A→B
  backward: CharacterRelationship; // B→A
  is_symmetric: boolean; // Whether A→B implies B→A
}
```

## Integration Points

### With Mood System

Relationships affect mood recovery and stability:

```typescript
// Strong ally: faster recovery
const allyModifier = {
  relationship_type: "ally",
  strength: 80,
  mood_recovery_modifier: 1.5, // 50% faster recovery
  mood_stability_modifier: 1.2, // 20% more stable
};

// Rival: slower recovery
const rivalModifier = {
  relationship_type: "rival",
  strength: -40,
  mood_recovery_modifier: 0.7, // 30% slower recovery
  mood_stability_modifier: 0.8, // 20% less stable
};
```

### With Personality Integrity

Relationships affect expression, NOT personality:

```typescript
// Relationship can modify expression
const expressionModifier = {
  warmth: relationship.strength > 0 ? 20 : -20,
  cooperation: relationship.strength > 0 ? 15 : -15,
  // But does NOT change personality traits
};
```

### With Chat Generation

Relationships are injected into LLM prompt:

```
[Relationships — {{char}}]
- Alice (ally, +75): Childhood friend, trading partner
  Mood Impact: +15 (positive presence)
  Secrets Known: Alice's family secret, Alice's fear of spiders
- Goblin Chief (enemy, -80): Defeated in combat, seeks revenge
  Mood Impact: -20 (stressful presence)
  Secrets Known: None
- Merchant Bob (friendly, +45): Reliable supplier
  Mood Impact: +5 (neutral presence)
  Secrets Known: Bob's discount policy
```

### With Avatar Selection

Relationship context affects avatar choice:

```typescript
// Avatar selection considers relationship
const avatar = selectAvatar(characterId, {
  relationship: "ally",
  relationship_strength: 75,
  context: "trading",
},);
```

### With Group Chat

Relationships affect group dynamics:

```typescript
// Group chat turn selection considers relationships
const turnSelection = {
  // Allies interact more
  ally_probability: 0.7,
  // Rivals avoid each other
  rival_probability: 0.3,
  // Enemies may conflict
  enemy_probability: 0.5,
};
```

## Tasks

### Phase 1: Schema & Core (Week 1)

- [ ] Create `character_relationships` table
- [ ] Implement `CharacterRelationship` interface
- [ ] Add relationship CRUD endpoints
- [ ] Add relationship event tracking
- [ ] Add relationship tier calculation

### Phase 2: Integration (Week 2)

- [ ] Integrate with mood system (mood modifiers)
- [ ] Integrate with personality resolution (expression modifiers)
- [ ] Integrate with chat generation (prompt injection)
- [ ] Integrate with avatar selection (relationship context)
- [ ] Integrate with group chat (turn selection)

### Phase 3: UI & Export (Week 3)

- [ ] Add relationship editor in character UI
- [ ] Add relationship graph visualization
- [ ] Add relationship export/import with character cards
- [ ] Add relationship history view

### Phase 4: Testing (Week 4)

- [ ] Unit tests for relationship CRUD
- [ ] Unit tests for relationship events
- [ ] Unit tests for relationship modifiers
- [ ] Integration tests with mood system
- [ ] Integration tests with group chat

## Files to Create

- `src/characters/relationships.ts` — Relationship CRUD
- `src/characters/relationship-events.ts` — Event tracking
- `src/characters/relationship-modifiers.ts` — Mood/expression modifiers
- `src/db/schema-relationships.ts` — Relationship tables
- `src/routes/character-relationships.ts` — API endpoints
- `src/components/relationship-editor.html` — UI component
- `src/components/relationship-graph.html` — Graph visualization

## Files to Modify

- `src/db/schema-core.ts` — Relationship column types
- `src/db/migrations/` — New tables
- `src/characters/mood.ts` — Relationship mood modifiers
- `src/characters/resolver.ts` — Relationship expression modifiers
- `src/assistant/prompt/sections/` — Relationship prompt injection
- `src/characters/avatar-selector.ts` — Relationship-based selection
- `src/group-chat/turn-selection.ts` — Relationship-aware selection
- `src/characters/parser.ts` — Relationship import/export

## Risk

Low–Med — schema addition, integration points well-defined. Main risk is relationship complexity in group chats with many characters.

## Related

- TASK-character-mood-happiness.md — Relationships affect mood
- TASK-character-personality-integrity.md — Relationships affect expression
- TASK-character-world-data-separation.md — Per-world relationships
- TASK-emotions-avatar-edit-model.md — Relationship-based avatar selection
- epic-character-core-system.md — Parent epic
- epic-social-interaction.md — Social mechanics overlap
