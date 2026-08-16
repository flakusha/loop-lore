<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AUX LLM — Environment Interaction Detection

**Status:** ⬜ Not Started
**Priority:** P2-B
**Effort:** Small
**Epic:** epic-aux-enrichment-pipeline
**Tags:** aux-llm, environment, interaction, world-state

## Summary

AUX LLM detects when user interacts with environment objects or NPCs.
Feeds into world state updates and event triggers.

## Design

### Input

User message + current location context.

### System Prompt

```
You are an environment interaction detector for a roleplay chat.
Analyze the user message for interactions with objects or NPCs.

Types of interactions:
- "object_use": using an item on something
- "npc_talk": speaking with an NPC
- "npc_trade": trading with an NPC
- "npc_attack": attacking an NPC
- "examine": looking at something closely
- "pickup": taking an object
- "activate": using a mechanism (door, lever, etc.)

Reply with ONLY a JSON object:
{
  "interactions": [
    {
      "type": "object_use|npc_talk|npc_trade|npc_attack|examine|pickup|activate",
      "target": "name or description of target",
      "action": "what the user is doing (max 50 chars)",
      "confidence": <0.0-1.0>
    }
  ]
}

Rules:
- Return empty array if no interactions detected
- Multiple interactions allowed per message
- confidence < 0.5 means uncertain
- target should be a name or short description
```

### Output

```typescript
interface EnvironmentInteraction {
  type: "object_use" | "npc_talk" | "npc_trade" | "npc_attack" | "examine" | "pickup" | "activate";
  target: string;
  action: string;
  confidence: number;
}
```

### Integration

1. AUX detects interactions
2. Interactions stored to world state
3. Triggers event system for NPC reactions
4. Feeds into quest progress tracking
5. Side effect (DB writes) happens async

### Use Cases

| Message                      | Detected Interaction                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| "I talk to the blacksmith"   | `{ type: "npc_talk", target: "blacksmith", action: "initiate conversation" }` |
| "I pick up the sword"        | `{ type: "pickup", target: "sword", action: "take item" }`                    |
| "I examine the ancient door" | `{ type: "examine", target: "ancient door", action: "inspect closely" }`      |
| "I attack the goblin"        | `{ type: "npc_attack", target: "goblin", action: "initiate combat" }`         |
| "I use the key on the lock"  | `{ type: "object_use", target: "lock", action: "unlock with key" }`           |

## Files to Create

- `src/aux-pipeline/tasks/environment.ts`

## Files to Modify

- `src/aux-pipeline/index.ts` — register environment task
- `src/world/state.ts` — add AUX-triggered interaction storage

## Acceptance Criteria

- [ ] Interaction detection returns valid JSON
- [ ] Empty array for non-interactive messages
- [ ] Interactions stored to world state
- [ ] NPC interactions trigger event system
- [ ] Timeout/error → no interactions (graceful)
- [ ] Existing world state tests still pass
