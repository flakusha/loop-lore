# TASK: NSFW Skills & Experience System

**Epic:** AO NSFW Game Mechanics
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement sexual skill system with skill categories (foreplay, oral, penetrative, BDSM, etc.), skill improvement through practice, technique unlocking based on skill levels, and skill synergy mechanics.

## Core Features

### Skill Categories

- Foreplay, Oral, Penetrative, Anal, Manual, Toys, BDSM, Massage, Striptease, Dirty Talk, Roleplay, Aftercare, Dominance, Submission, Exhibitionism, Voyeurism, Stamina, Sensitivity, Creativity, Communication

### Skill Progression

- Skills improve through use
- Experience points per action
- Level-up unlocks new techniques
- Skill synergies (boost related skills)

### Techniques

- Unlocked at skill level thresholds
- Require specific skill combinations
- Have arousal/satisfaction/intimacy effects
- Have position/equipment/location requirements
- Have risks (injury, stamina cost)

### Experience Tracking

- Total experience per skill
- Partner-specific experience
- Context-specific experience (location, scenario)

## Tasks

- [ ] Design skill system architecture
- [ ] Implement skill categories
- [ ] Implement skill progression
- [ ] Implement skill improvement mechanics
- [ ] Implement technique definitions
- [ ] Implement technique unlocking
- [ ] Implement skill synergies
- [ ] Implement experience tracking
- [ ] Integrate with seduction system
- [ ] Integrate with encounter system
- [ ] Write tests for skill system

## Files

- `src/rpg/skills-sexual/manager.ts` — skill manager
- `src/rpg/skills-sexual/categories.ts` — skill categories
- `src/rpg/skills-sexual/progression.ts` — skill progression
- `src/rpg/skills-sexual/techniques.ts` — technique definitions
- `src/rpg/skills-sexual/synergies.ts` — skill synergies
- `src/rpg/skills-sexual/types.ts` — type definitions
