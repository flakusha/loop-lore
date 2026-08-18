<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Fantasy & Kink System

**Epic:** AO NSFW Game Mechanics
**Priority:** Medium
**Effort:** Large
**Status:** Not Started

## Summary

Implement fantasy/kink system with kink discovery, fantasy fulfillment mechanics, and mechanical effects for fulfilling fantasies, driven by the canonical `FantasyCategory` enum in `src/db/enums-character/nsfw.ts`.

## Core Features

### Fantasy Categories

- Category set is canonicalized in `FantasyCategory` (`src/db/enums-character/nsfw.ts`); extend that enum to add a category. No category list duplicated here.

### Kink Discovery

- Characters discover new kinks through play
- Discovery depends on context, partner, openness
- Initial reaction (positive/neutral/negative/shocked)
- Kink evolves with experience

### Fantasy Fulfillment

- Requirements: partner type, location, equipment, scenario
- Effects: satisfaction bonus, intimacy bonus, mood bonus, memory strength
- Risks: reputation, emotional, physical, discovery

### Hard Limits

- Mechanically enforced boundaries
- Cannot be overridden by seduction/skills
- Set during character creation or discovered through play

## Tasks

- [ ] Design fantasy system architecture
- [ ] Implement fantasy categories
- [ ] Implement kink discovery
- [ ] Implement fantasy fulfillment
- [ ] Implement hard limits enforcement
- [ ] Implement kink evolution
- [ ] Implement fantasy risk mechanics
- [ ] Integrate with seduction system
- [ ] Integrate with encounter system
- [ ] Integrate with mood system
- [ ] Write tests for fantasy system

## Files

- `src/rpg/fantasy/manager.ts` — fantasy manager
- `src/rpg/fantasy/categories.ts` — fantasy categories
- `src/rpg/fantasy/discovery.ts` — kink discovery
- `src/rpg/fantasy/fulfillment.ts` — fantasy fulfillment
- `src/rpg/fantasy/limits.ts` — hard limits
- `src/rpg/fantasy/types.ts` — type definitions
