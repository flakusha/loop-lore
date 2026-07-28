# TASK: Resolution System Integration

**Epic:** RPG Mechanics, Battle & Action Systems, Social Interaction, Magic & Spell Systems
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G5 (Resolution ↔ All combat/social/magic)

## Summary

Unified dice resolution system that all combat, social, and magic systems share.

## Background

Resolution claims to unify dice resolution but has no integration section. Never references Battle, Social, Magic, or RPG — each system has its own ad-hoc resolution logic.

## Implementation

### Unified Dice Resolution

All skill checks, combat attacks, saves, and social checks use the same resolution:

```
result = d20 + attribute_modifier + skill_bonus + situational_modifiers
```

### Resolution Contracts

| System | Input | Output |
| --- | --- | --- |
| Battle | attack roll | hit/miss, damage |
| Social | skill check | success/failure, degree |
| Magic | spell attack/save | hit/miss, effect |
| Skill | ability check | success/failure |

### Shared Dice Engine

Extract the common dice engine into `src/rpg/dice/` shared module.

## Acceptance Criteria

- [ ] Single dice resolution module used by all systems
- [ ] Battle attacks use shared resolution
- [ ] Social checks use shared resolution
- [ ] Magic saves use shared resolution
- [ ] All resolution uses same modifier calculation
