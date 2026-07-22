# TASK: Character Relationships — Inter-Character Bonds

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Source:** Roadmap migration, 2026-07-19

## Summary

Define and track relationships between characters — allies, rivals, family, romantic, etc. Affects dialogue tone, group chat dynamics, and story generation.

## Rationale

- Characters in group chats should react differently based on relationships
- Story generation should account for character bonds
- Users want to define character backstories including relationships

## Design

### Relationship Types

```typescript
type RelationshipType =
  | "ally"
  | "rival"
  | "family"
  | "romantic"
  | "mentor"
  | "subordinate"
  | "enemy"
  | "neutral"
  | "custom";

interface CharacterRelationship {
  id: string;
  fromActorId: string;
  toActorId: string;
  type: RelationshipType;
  strength: number; // 0-100 (how strong the bond)
  description?: string; // "Childhood friends", "Sworn enemies"
  bidirectional: boolean; // Does A→B imply B→A?
  metadata?: Record<string, unknown>;
}
```

### Integration Points

- Group chat: relationship affects turn order, dialogue tone
- Story generation: relationships inform narrative choices
- Character cards: relationships exported with character

## Tasks

- [ ] Create `character_relationships` table
- [ ] Add relationship CRUD endpoints
- [ ] Add relationship editor in character UI
- [ ] Wire relationships into group chat logic
- [ ] Wire relationships into story generation
- [ ] Export/import relationships with character cards

## Files to Create

- `src/db/schema-relationships.ts` — relationship tables
- `src/routes/character-relationships.ts` — CRUD endpoints
- `src/components/relationship-editor.html` — UI component

## Files to Modify

- `src/db/schema.ts` — add relationship tables
- `src/group-chat/turn-selection.ts` — relationship-aware
- `src/story/` — relationship-aware generation
- `src/characters/parser.ts` — relationship import/export

## Risk

Low–Med — schema addition, integration points well-defined.
