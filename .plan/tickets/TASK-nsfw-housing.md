# TASK: NSFW-Housing Integration

**Epic:** NSFW Game Mechanics, Housing & Base Building
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G6 (NSFW ↔ Housing)

## Summary

Housing provides private spaces with comfort bonuses for NSFW encounters. NSFW location types (bedroom, bath) integrate with housing.

## Background

NSFW defines NSFWLocation types (bedroom, bath); Housing provides private spaces. Neither references the other.

## Implementation

### Comfort Bonuses

Housing locations can have comfort bonuses for NSFW encounters:

| Housing Feature  | Comfort Bonus                    |
| ---------------- | -------------------------------- |
| Private bedroom  | +2 to NSFW check DC              |
| Hot tub/bath     | +1 to persuasion in NSFW context |
| Outdoor/secluded | No bonus, no penalty             |
| Crowded/shared   | -2 to NSFW check DC              |

### NSFWLocation ↔ Housing

- Bedroom location type links to housing unit
- Bath location type links to housing unit
- Private spaces unlock NSFW content filters

## Acceptance Criteria

- [ ] Housing provides comfort bonuses for NSFW encounters
- [ ] NSFW location types link to housing units
- [ ] Private vs shared spaces affect NSFW DC
