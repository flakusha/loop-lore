<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Skills & Experience System

**Epic:** AO NSFW Game Mechanics
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement the sexual skill system with skill categories, skill improvement through practice, technique unlocking based on skill levels, and skill synergy mechanics, driven by the canonical `SeductionSkillCategory` enum in `src/db/enums-character/nsfw.ts`.

## Core Features

### Skill Categories

- Category set is canonicalized in `SeductionSkillCategory` (`src/db/enums-character/nsfw.ts`); extend that enum to add a category. No category list duplicated here.

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
