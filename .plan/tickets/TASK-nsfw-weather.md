# TASK: NSFW-Weather Integration

**Epic:** NSFW Game Mechanics, Weather & Environment
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G7 (NSFW ↔ Weather)

## Summary

Weather affects NSFW encounter mood and location availability.

## Background

NSFW defines location modifiers; Weather defines environmental mood. Neither references the other.

## Implementation

### Weather Mood Effects on NSFW

| Weather | Mood Effect | NSFW Impact |
| --- | --- | --- |
| Clear, warm | Relaxed | +1 to comfort checks |
| Rain, cold | Cozy (indoor) | Bonus for indoor encounters |
| Storm | Tension | +1 to intensity checks |
| Fog | Mysterious | Bonus for seduction |
| Extreme heat | Irritable | -1 to patience checks |

### Location Availability

Some NSFW locations become unavailable during certain weather (outdoor hot springs in snow).

## Acceptance Criteria

- [ ] Weather affects NSFW encounter mood
- [ ] Indoor/outdoor location availability weather-gated
- [ ] Seasonal weather patterns affect NSFW availability
