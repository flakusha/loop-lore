<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Character Interactions Specification

**Status:** Implemented foundation. The shared interaction ledger, reference
commands, canonical relationship updates, and reputation-tier modifiers are
wired in `src/rpg/interaction/` and `src/assistant/commands/interaction.ts`.
NPC-to-NPC conversation simulation remains aspirational.
**Authoritative source:** `src/` and `AGENTS.md`

## Overview

Defines how characters interact in chat. Heavy actions use one mathematical
resolution path regardless of category, then persist both the roll and the
resulting state changes for later turns.

## Unified Interaction Record

`interaction_logs` is the append-only cross-system ledger. Each row records:

- actor, chat, world, target, and location references;
- command, category, skill, difficulty, action points, and roll mode;
- individual die values, raw total, final total, margin, and outcome;
- a JSON modifier breakdown with a source and signed value; and
- JSON result and state-change payloads.

Successful and failed checks are both recorded. A blocked interaction records
`outcome = blocked`, null roll fields, and the missing-material reason, so a
resource gate does not disappear from interaction history.

## Interaction Types

| Type               | Trigger                             | Check                             | Outcome                           |
| ------------------ | ----------------------------------- | --------------------------------- | --------------------------------- |
| Dialogue modifier  | Character relationship tier         | None                              | Modified response tone/vocabulary |
| Social check       | Persuasion, intimidation, deception | Ability/skill-based               | Success/failure with degree       |
| Relationship shift | Significant interaction             | Persuasion vs. target disposition | Standing and familiarity change   |

## Relationship Tiers

| Tier       | Dialogue effect            | Check modifier |
| ---------- | -------------------------- | -------------- |
| Hostile    | Aggressive/blocked options | -5             |
| Unfriendly | Restricted options         | -2             |
| Neutral    | Standard dialogue          | +0             |
| Friendly   | Additional options         | +2             |
| Allied     | Open options, shared info  | +5             |
| Devoted    | Highest trust              | +5             |

The interaction command reads the canonical `character_relationships` row and
uses `getReputationTier` for the modifier. Social outcomes update that same
relationship through `RelationshipsService`; the legacy `npc_states`
relationship JSON is not a second source of truth.

## Interaction Rules

- Characters cannot interact if they are in different worlds (unless cross-world contact is enabled)
- NPC disposition shifts based on interaction outcomes
- Repeated positive interactions improve standing; negative interactions degrade it
- Interaction DC scales with relationship distance (stranger vs. ally)
- Ability, relationship, equipment, and circumstance modifiers remain separately
  identifiable in the persisted modifier breakdown

## Related Epics

- `.plan/epics/epic-social-interaction.md`
- `.plan/epics/epic-character-core-system.md`
- `.plan/epics/epic-rpg-mechanics.md`

## Related Tickets

- `TASK-interaction-service-foundation`
- TASK-npc-behavior, TASK-npc-memory, TASK-npc-inventory
