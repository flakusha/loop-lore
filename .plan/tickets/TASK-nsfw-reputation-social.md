<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Reputation & Social Consequences

**Epic:** AO NSFW Game Mechanics
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Implement sexual reputation system with promiscuity/skill/kinkiness/fidelity/danger scores, rumor propagation, conquest tracking, and social consequences (partner availability, jealousy, social standing).

## Core Features

### Reputation Scores

- Overall reputation (-100 to 100)
- Promiscuity (0-100) — how many partners known
- Skill (0-100) — reputation for sexual skill
- Kinkiness (0-100) — reputation for kink
- Fidelity (0-100) — reputation for faithfulness
- Danger (0-100) — reputation for risky behavior

### Rumors

- True/false rumors about sexual activity
- Spread chance based on witnesses, gossip skill
- Effects on reputation and relationships
- Can be started, denied, or confirmed

### Conquest Tracking

- Known sexual partners
- Relationship history
- Notable encounters

### Social Effects

- Reputation affects seduction difficulty
- More reputation = more offers
- Jealousy risk from partners
- Social standing changes

## Tasks

- [ ] Design reputation system architecture
- [ ] Implement reputation scores
- [ ] Implement rumor propagation
- [ ] Implement conquest tracking
- [ ] Implement social effects
- [ ] Implement jealousy mechanics
- [ ] Integrate with seduction system
- [ ] Integrate with intimacy system
- [ ] Integrate with NPC AI
- [ ] Write tests for reputation system

## Files

- `src/rpg/reputation-nsfw/manager.ts` — reputation manager
- `src/rpg/reputation-nsfw/scores.ts` — reputation scores
- `src/rpg/reputation-nsfw/rumors.ts` — rumor system
- `src/rpg/reputation-nsfw/conquests.ts` — conquest tracking
- `src/rpg/reputation-nsfw/effects.ts` — social effects
- `src/rpg/reputation-nsfw/types.ts` — type definitions
