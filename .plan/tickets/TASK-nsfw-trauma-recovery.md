# TASK: NSFW Trauma & Recovery

**Epic:** AO NSFW Game Mechanics
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Implement trauma system for negative NSFW experiences: trauma types (violation, betrayal, humiliation, pain, discovery, rejection), mechanical effects (trigger situations, avoidance behaviors, trust modifiers), and recovery mechanics (therapy, positive experiences, time).

## Core Features

### Trauma Types

- Violation: non-consensual experiences
- Betrayal: partner infidelity/breaking trust
- Humiliation: public embarrassment
- Pain: excessive physical harm
- Discovery: caught during private acts
- Rejection: harsh romantic/sexual rejection

### Trauma Effects

- Trigger situations: what causes flashbacks/distress
- Avoidance behaviors: what the character avoids
- Trust modifiers: difficulty trusting certain partner types
- Therapy progress: 0-100 recovery through treatment

### Recovery Mechanics

- Therapy sessions (NPC or player-driven)
- Positive experiences (counter-conditioning)
- Time healing (passive recovery)
- Support from trusted partners
- Full recovery possible

### Trauma Prevention

- Aftercare reduces trauma risk
- Consent checking prevents violation trauma
- Communication reduces misunderstanding trauma

## Tasks

- [ ] Design trauma system architecture
- [ ] Implement trauma types
- [ ] Implement trauma effects
- [ ] Implement trigger situations
- [ ] Implement avoidance behaviors
- [ ] Implement recovery mechanics
- [ ] Implement therapy system
- [ ] Implement trauma prevention
- [ ] Integrate with mood system
- [ ] Integrate with encounter system
- [ ] Integrate with intimacy system
- [ ] Write tests for trauma system

## Files

- `src/rpg/trauma/manager.ts` — trauma manager
- `src/rpg/trauma/types.ts` — trauma types
- `src/rpg/trauma/effects.ts` — trauma effects
- `src/rpg/trauma/recovery.ts` — recovery mechanics
- `src/rpg/trauma/therapy.ts` — therapy system
- `src/rpg/trauma/prevention.ts` — trauma prevention
