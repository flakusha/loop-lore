# TASK: Social Interaction Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-social-interaction

## Summary

Social interaction mechanics — persuasion, intimidation, deception, barter, leadership, and reputation. From `epic-social-interaction.md`.

## Scope

### Core Social Skills

- Persuasion, Intimidation, Deception
- Barter, Leadership, Charisma
- Skill checks and modifiers

### Persuasion System

- Persuasion attempts and DCs
- Reputation modifiers
- Success/failure consequences

### Reputation System

- Faction reputation
- NPC disposition
- Reputation rewards/penalties

### Social Encounters

- Dialogue mechanics
- Social combat
- NPC reactions

## Linked Epics

- `epic-social-interaction.md`

## Acceptance Criteria

- [ ] Core social skills (persuasion, intimidation, deception)
- [ ] Skill check mechanics with DCs
- [ ] Reputation system with faction standing
- [ ] NPC disposition based on reputation
- [ ] Social encounter mechanics
- [ ] Integration with RPG stats (CHA, WIS, INT)
- [ ] Unit tests for social calculations
- [ ] Integration tests for social encounters

## Notes

- Reference `epic-social-interaction.md` for full system design
- Consider social skill progression
- Balance social encounters vs. combat

## Research Extensions (2026-08-14)

Research on social simulation (generative-agents, Inworld AI) identified NPC-to-NPC extension:

### NPC-to-NPC Autonomous Social
This ticket covers player-facing social skills. NPCs should also interact with each other:
- Decision-to-interact based on proximity, activity, relationship, mood
- Conversation generation with topics from shared context
- Information propagation through social network (gossip)
- Emergent social dynamics (clusters, conflicts, reputation spread)

**See:** `TASK-npc-to-npc-social.md` for full NPC-to-NPC social simulation.

### Shared Social Infrastructure
Both player-facing and NPC-to-NPC social systems share:
- Reputation system (faction standing affects all social interactions)
- Relationship tracking (relationship strength drives NPC behavior)
- Social skill checks (same mechanics for player and NPC actions)

### Cross-References
- `TASK-npc-to-npc-social.md` — NPC-to-NPC autonomous social simulation
- `TASK-character-relationships.md` — Dynamic relationship evolution
- `TASK-character-mood-happiness.md` — Mood affects social willingness
- `TASK-npc-behavior.md` — Social state in NPC behavior machine
