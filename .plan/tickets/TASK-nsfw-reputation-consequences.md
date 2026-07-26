# TASK: NSFW Social Reputation & Consequence System

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-nsfw-game-mechanics
**Tags:** nsfw, reputation, consequences, social, content-rating

## Description

Add a social reputation and consequence system for NSFW choices in the NSFW Game Mechanics epic — NPCs and factions react to the character's NSFW behavior, creating meaningful social consequences. Extends the existing NSFW rating system with social dynamics.

## How It Extends Existing Work

Builds on the NSFW Game Mechanics epic's content rating, NSFW categories, and hard limits. Adds social reputation tracking and consequence mechanics on top of the existing NSFW gating system.

## Acceptance Criteria

- [ ] NSFW reputation tracking per faction/NPC group
- [ ] Consequence system — NPCs react differently based on NSFW reputation
- [ ] Content warning system for other players when interacting
- [ ] Reputation decay over time (forgiveness/reform mechanics)
- [ ] NSFW reputation visible in character profile (configurable privacy)
- [ ] `GET /api/characters/:id/nsfw-reputation` endpoint
- [ ] Frontend NSFW reputation panel
- [ ] Frontend content warning indicators in chat

## Technical Notes

- NSFW reputation stored per faction/NPC group, not globally
- Consequence types: dialogue changes, quest availability, faction standing, relationship penalties
- Privacy settings control who can see the player's NSFW reputation
- Integrates with Character Core System epic's licensing and privacy model
