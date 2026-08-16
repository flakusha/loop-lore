<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# NPC & Character Relationships Specification

**Status:** Draft
**Type:** Spec
**Dependencies:** character-spec.md, nsfw.md, social-interaction.md

---

## Overview

Relationship graphs define how characters (player and NPC) relate to each other. This spec covers the data model, relationship types, graph operations, and integration with NSFW mechanics, social skills, and faction standing.

## 1. Relationship Data Model

### 1.1 Core Entities

```typescript
interface RelationshipGraph {
  id: string;
  participants: string[]; // Character IDs
  edges: RelationshipEdge[];
  scope: "chat" | "world" | "global";
  metadata: {
    createdAt: string;
    lastUpdated: string;
    chatId?: string; // Scoped to chat
    worldId?: string; // Scoped to world
  };
}

interface RelationshipEdge {
  source: string; // Character ID
  target: string; // Character ID
  type: RelationshipType;
  strength: number; // 0-100
  history: RelationshipEvent[];
  flags: RelationshipFlags;
}

type RelationshipType =
  | "romantic"
  | "friendly"
  | "rival"
  | "enemy"
  | "familial"
  | "professional"
  | "mentor"
  | "student"
  | "trusted"
  | "suspicious"
  | "neutral";

interface RelationshipFlags {
  isPlayerNpc: boolean;
  isNpcNpc: boolean;
  isPlayerPlayer: boolean;
  nsfwEnabled: boolean;
  visibleTo: string[]; // Character IDs who can see this
}

interface RelationshipEvent {
  id: string;
  timestamp: string;
  type: "interaction" | "choice" | "combat" | "trade" | "dialogue" | "quest";
  description: string;
  strengthDelta: number;
  source: string; // Who initiated
  context: Record<string, unknown>;
}
```

### 1.2 Relationship Levels

| Level             | Strength | Description                         |
| ----------------- | -------- | ----------------------------------- |
| Stranger          | 0-10     | No meaningful connection            |
| Acquaintance      | 11-25    | Know each other, minimal trust      |
| Friend            | 26-45    | Positive rapport, willing to help   |
| Close Friend      | 46-65    | Strong trust, shared history        |
| Romantic Interest | 66-75    | Romantic potential unlocked         |
| Dating            | 76-85    | Committed romantic relationship     |
| Intimate          | 86-95    | Deep emotional/physical bond        |
| Soulbonded        | 96-100   | Unbreakable bond, permanent effects |

## 2. Graph Operations

### 2.1 Query Operations

- **Get relationships for character:** Filter by character ID, type, and scope.
- **Get relationship between two characters:** Direct edge lookup.
- **Get NPC-NPC relationships:** For world-building and encounter generation.
- **Get visible relationships:** Filter by `visibleTo` and NSFW flags.

### 2.2 Update Operations

- **Add edge:** Create a new relationship between two characters.
- **Update strength:** Modify edge strength based on events.
- **Add event:** Append to relationship history.
- **Change type:** Shift relationship type (e.g., friendly → romantic).
- **Remove edge:** Dissolve relationship (with consequences).

### 2.3 Propagation Rules

- NPC-NPC relationship changes affect available dialogue options.
- Relationship strength affects social skill check DCs.
- Faction standing modifies relationship propagation (allied faction NPCs gain +10 strength).
- NSFW mechanics are gated by relationship type and intimacy level.

## 3. Integration Points

### 3.1 NSFW Mechanics

- Intimacy levels gate NSFW content availability.
- NSFW actions create relationship events with strength deltas.
- Opt-in/opt-out per user per chat applies to relationship progression.

### 3.2 Social Interaction Skills

- Relationship strength modifies social skill DCs (higher strength = lower DC for friendly actions).
- Social skill outcomes modify relationship strength.
- Critical successes/failures create relationship events.

### 3.3 Faction Standing

- Characters in the same faction gain relationship strength over time.
- Faction enemies have a relationship floor (cannot go above 'suspicious').
- Faction standing changes propagate to relationships with faction NPCs.

### 3.4 Combat

- Combat allies gain relationship strength.
- Combat enemies gain relationship strength toward each other.
- Kill events create permanent relationship shifts.

## 4. Storage & Persistence

- Relationship graphs are stored as separate documents from character data.
- Chat-scoped graphs are stored with the chat session.
- World-scoped graphs are stored with the world state.
- Global graphs are stored in a shared collection.
- Graph updates are versioned for replayability and catchup.
