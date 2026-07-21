# TASK: NSFW Encounter System

**Epic:** AO NSFW Game Mechanics
**Priority:** High
**Effort:** Very High
**Status:** Not Started

## Summary

Implement structured adult encounter system with phases (foreplay, building, climax, aftercare), skill checks during encounters, encounter types (romantic, passionate, experimental, dominant, etc.), and mechanical outcomes (satisfaction, pregnancy, bonding, trauma).

## Core Features

### Encounter Types

- Romantic, Passionate, Experimental, Dominant, Submissive, Public, Voyeuristic, Group, Roleplay, Rough, Tender

### Encounter Phases

- Foreplay: teasing, arousal building
- Building: intensity increasing
- Climax: peak moment
- Aftercare: emotional processing, recovery

### Skill Checks

- Skills tested during each phase
- Success/failure affects outcomes
- Partner compatibility affects difficulty
- Location affects modifiers

### Outcomes

- Satisfaction: mood/intimacy bonuses
- Pregnancy: reproductive consequences
- Bonding: relationship strengthening
- Trauma: negative experiences
- Discovery: risk of being caught

## Tasks

- [ ] Design encounter system architecture
- [ ] Implement encounter types
- [ ] Implement encounter phases
- [ ] Implement skill checks during encounters
- [ ] Implement encounter outcomes
- [ ] Implement satisfaction scoring
- [ ] Implement aftercare mechanics
- [ ] Implement encounter memory creation
- [ ] Integrate with arousal system
- [ ] Integrate with body system
- [ ] Integrate with pregnancy system
- [ ] Integrate with trauma system
- [ ] Write tests for encounter system

## Files

- `src/rpg/encounters/manager.ts` — encounter manager
- `src/rpg/encounters/types.ts` — encounter types
- `src/rpg/encounters/phases.ts` — encounter phases
- `src/rpg/encounters/skill-checks.ts` — skill checks
- `src/rpg/encounters/outcomes.ts` — encounter outcomes
- `src/rpg/encounters/aftercare.ts` — aftercare mechanics
