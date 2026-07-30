# TASK: Battle-Social Checks Integration

**Epic:** Battle & Action Systems, Social Interaction
**Priority:** Medium
**Effort:** High
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G2 (Battle ↔ Social)

## Summary

Integrate social checks into combat for morale breaks, surrender, and intimidation effects.

## Background

Social interaction lists "Intimidation in combat" as an integration point, but Battle never references social skills as combat options (taunt, negotiate, surrender). Social skills like persuasion, deception, and intimidation should have combat applications.

## Implementation

### Combat Social Checks

| Social Skill | Combat Application                         | DC                   |
| ------------ | ------------------------------------------ | -------------------- |
| Intimidation | Break enemy morale (flee, surrender)       | 10 + enemy HD        |
| Persuasion   | Negotiate parley, ceasefire                | 15 + enemy HD        |
| Deception    | Feint in combat (advantage on next attack) | 12 + enemy HD        |
| Leadership   | Rally allies (remove fear, grant temp HP)  | 13 + allies affected |

### Morale System

NPC combatants have a morale threshold. When morale drops below zero (based on HP loss, allies felled, failed morale saves), they may flee or surrender.

### Surrender Mechanics

- Fleeing enemies can be captured (PRISON) or dispatched
- Surrendered enemies become allies if persuasion succeeds
- Killing surrendered enemies has reputation penalty

## Acceptance Criteria

- [ ] Social check roll available during combat (intimidate, parley, feint)
- [ ] Morale system for NPC combatants
- [ ] Flee/surrender/submit combat results
- [ ] Reputation impact for mercy vs cruelty
- [ ] Intimidation check affects enemy morale
