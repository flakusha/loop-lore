# TASK: NSFW-Social Integration

**Epic:** NSFW Game Mechanics, Social Interaction
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G8 (NSFW ↔ Social)

## Summary

Social skills (persuasion, deception) serve as seduction prerequisites. Shared reputation model between social and NSFW systems.

## Background

NSFW seduction/reputation overlap with Social's reputation and persuasion. Neither cross-references the other.

## Implementation

### Social Prerequisites for NSFW

| NSFW Action | Required Social Skill | DC |
| --- | --- | --- |
| Seduction attempt | Persuasion | 12 |
| Charm effect | Persuasion | 14 |
| Deceptive seduction | Deception | 13 |
| Intimate conversation | Empathy (Wisdom check) | 10 |

### Shared Reputation

Reputation changes apply across both systems:

- Successful seduction with consent → +1 reputation
- Failed seduction attempt → -1 reputation
- Coercion/force → -5 reputation, possible crime flag

## Acceptance Criteria

- [ ] Social skill prerequisites for NSFW actions
- [ ] DC scales with NSFW intensity
- [ ] Reputation shared between social and NSFW
- [ ] Coercion has consequences
