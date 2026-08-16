<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Character Interactions Specification

**Status:** Final
**Authoritative source:** `src/` and `AGENTS.md`

## Overview

Defines how characters interact with each other in chat, including relationship-based dialogue modifiers, social checks, and interaction rules.

## Interaction Types

| Type               | Trigger                             | Check                             | Outcome                           |
| ------------------ | ----------------------------------- | --------------------------------- | --------------------------------- |
| Dialogue modifier  | Character relationship tier         | None                              | Modified response tone/vocabulary |
| Social check       | Persuasion, intimidation, deception | Charisma-based                    | Success/failure with degree       |
| Relationship shift | Significant interaction             | Persuasion vs. target disposition | Standing change                   |

## Relationship Tiers

| Tier       | Dialogue Effect            | Check Modifier |
| ---------- | -------------------------- | -------------- |
| Hostile    | Aggressive/blocked options | -5             |
| Unfriendly | Restricted options         | -2             |
| Neutral    | Standard dialogue          | +0             |
| Friendly   | Additional options         | +2             |
| Ally       | Open options, shared info  | +5             |

## Interaction Rules

- Characters cannot interact if they are in different worlds (unless cross-world contact is enabled)
- NPC disposition shifts based on interaction outcomes
- Repeated positive interactions improve standing; negative interactions degrade it
- Interaction DC scales with relationship distance (stranger vs. ally)

## Related Epics

- `epic-social-interaction.md`
- `epic-character-core-system.md`

## Related Tickets

- TASK-npc-behavior, TASK-npc-memory, TASK-npc-inventory
