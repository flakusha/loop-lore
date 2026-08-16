<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# NSFW Content & Mechanics Specification

**Status:** Draft
**Type:** Content Spec
**Dependencies:** character-spec.md, social-interaction.md, chat-privacy.md

---

## Overview

NSFW (Not Safe For Work) content encompasses adult themes, explicit content, and mature subject matter within the RPG chat system. This spec defines the content policy, opt-in/opt-out mechanics, integration with game systems, and relationship graph handling.

## 1. Content Policy Model

### 1.1 Content Classification

| Level    | Label    | Description                    | Example                               |
| -------- | -------- | ------------------------------ | ------------------------------------- |
| `safe`   | SFW      | No adult content               | Combat, exploration, dialogue         |
| `mature` | Moderate | Themes without explicit detail | Romance tension, violence implied     |
| `adult`  | Explicit | Detailed adult content         | Intimacy scenes, graphic descriptions |

### 1.2 Per-User Content Preferences

```typescript
interface UserContentPreferences {
  userId: string;
  nsfwLevel: "safe" | "mature" | "adult";
  optInMechanics: string[]; // Which mechanics user has opted into
  optOutMechanics: string[]; // Which mechanics user has opted out of
  perChatOverrides: ChatContentOverride[];
}

interface ChatContentOverride {
  chatId: string;
  nsfwLevel: "safe" | "mature" | "adult" | "inherit";
  mechanicsOverride: Record<string, boolean>; // mechanicId -> allowed
}
```

### 1.3 Opt-In / Opt-Out Mechanics

Each game mechanic that can produce adult content has an independent opt-in/opt-out flag per user per chat:

| Mechanic     | Default | Description                                          |
| ------------ | ------- | ---------------------------------------------------- |
| `intimacy`   | opt-out | Relationship progression, romantic encounters        |
| `seduction`  | opt-out | Seduction attempts, desire systems                   |
| `combat`     | opt-in  | Violence (can be mature or adult depending on level) |
| `body`       | opt-out | Physical descriptions, body systems                  |
| `reputation` | opt-in  | Social consequences, reputation impact               |
| `pregnancy`  | opt-out | Pregnancy mechanics, reproduction                    |
| `fantasy`    | opt-out | Kink mechanics, fantasy scenarios                    |

**Rules:**

- Opt-out mechanics are completely suppressed for that user in that chat — no adult content is generated for that mechanic.
- Opt-in mechanics are available but still subject to the user's `nsfwLevel` ceiling.
- Chat-level overrides can per-user override defaults for that specific conversation.
- Global defaults apply when no chat override exists.

## 2. Relationship Graph System

### 2.1 Data Model

```typescript
interface RelationshipGraph {
  id: string;
  participants: string[]; // Character IDs
  edges: RelationshipEdge[];
  metadata: {
    createdAt: string;
    lastUpdated: string;
    chatId: string; // Isolated by chat
    worldId?: string; // Optional world-level graph
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
  nsfwEnabled: boolean; // Whether this edge allows NSFW content
  visibleTo: string[]; // Who can see this relationship
}
```

### 2.2 Relationship Graph Operations

- **Query:** Get all relationships for a character, filtered by type and NSFW visibility.
- **Update:** Modify edge strength based on interactions, choices, and events.
- **Propagate:** NPC-NPC relationship changes affect available dialogue and encounters.
- **Isolate:** Graphs are scoped to chat by default; world-level graphs are opt-in.

## 3. Integration with Other Mechanics

### 3.1 NSFW ↔ Combat

- Combat can produce mature/adult content (injuries, death) based on `nsfwLevel`.
- Intimidation skill check can leverage NSFW mechanics for persuasion.
- Combat outcomes can affect relationship graphs (grudges, respect).

### 3.2 NSFW ↔ Social Interaction

- Seduction is a social skill check that can be resisted or accepted.
- Relationship graph edges determine available social approaches.
- Intimacy levels gate NSFW content availability.

### 3.3 NSFW ↔ Reputation / Factions

- NSFW actions can have reputation consequences with factions.
- Some factions may have taboos or preferences regarding NSFW content.
- Reputation changes from NSFW actions follow the same standing system.

### 3.4 NSFW ↔ Quests

- Quests can require or be gated by NSFW content availability.
- Quest rewards may include NSFW items or experiences.
- Quest outcomes can shift relationship graphs.

## 4. Implementation Notes

- Content filtering is applied at the generation layer, not the storage layer.
- NSFW flags are stored per-user, not per-message (avoids PII in message content).
- Relationship graphs are stored separately from character data for isolation.
- Opt-in/opt-out state is checked before every generation call.
