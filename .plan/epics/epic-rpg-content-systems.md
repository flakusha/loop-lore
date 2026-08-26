<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RPG Content Systems — Quests, Achievements & RPG Chat

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** rpg, quests, achievements, rpg-chat, llm-narrative
**Parent Epic:** RPG Mechanics & Extensible Game Systems (epic-rpg-mechanics.md)

## Summary

Quest system (main quests, side quests, chains, story end conditions), achievement definitions/unlocking/rewards, and question-based RPG chat gameplay. LLM-narrative adjacent: quest text, chat questions, and narrative framing are LLM-generated; mechanics state is deterministic.

## Sub-Epic of

Part of the **RPG Mechanics & Extensible Game Systems** mega-epic. See parent epic for full scope, integration matrix, and slicing rationale.

## Scope

### Quest System

- Quest creation and management
- Quest objectives and tracking
- Quest rewards and completion
- Quest chains and dependencies

### Achievement System

- Achievement definitions and tracking
- Achievement unlocking and display
- Achievement rewards
- Achievement categories and tiers

### RPG Chat (Question-Based Gameplay)

- Question-based gameplay mode inside RPG sessions
- Option selection driving mechanics state

> **Coordination:** `epic-achievements.md` already carries achievements code+tests+schema
> (migration 035) awaiting route wiring — build on that work rather than redefining the system.
> Quest/encounter structure coordinates with `epic-quests-encounters.md`.

## Tasks

- [ ] Quest system (main, side, chains, story end conditions)
- [ ] Achievement system
- [ ] RPG chat with question-based gameplay

## Dependencies

- **Parent hub:** epic-rpg-mechanics.md (`rpg.xp_granted` events feed quest/achievement rewards)
- **Depends on:** epic-rpg-core-wiring.md (registry + barrel; FIRST in sequence)
- **Siblings:** epic-items-economy-crafting.md (quest rewards → items/currency), epic-rpg-progression.md (XP rewards), epic-mechanics-governance.md (`questSystemEnabled` world flag)
- **External:** Faction & Reputation (reputation gates quests), Social Interaction, LLM narrative pipeline

## Files

- `src/rpg/quests.ts` — quest system (not yet implemented)
- `src/rpg/achievements/` — achievement module + service (exists; routes pending — see `epic-achievements.md`)

## Open Questions

### Quest System

- How should quest chains handle branching paths?
- Should failed quests be retryable or permanent?
- How to handle party death — full reset or checkpoint system?
- Should quests have dynamic difficulty based on party level?

### RPG Chat Questions

- How many options per question is optimal (2-4)?
- Should questions have time limits?
- How to handle "none of the above" options?
- Should questions be voice-acted or text-only?
- How to handle state transitions between question and free-form modes?
- Should question mode be triggered automatically or manually?
- How to maintain immersion during mode switches?
