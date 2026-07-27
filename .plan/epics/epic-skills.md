# Epic: Skills

**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** skills, abilities, progression, mastery, specialization

## Overview

Character skill system — abilities, progression, mastery, and specialization mechanics. Covers skill trees, skill points, prerequisites, synergies, and skill-based gameplay.

## Skill Systems

### Core Skill Model

interface Skill {
}
interface SkillTree {
}
interface SkillBranch {
}
interface SkillNode {
}
interface SkillPrerequisite {
}

### Progression

interface SkillProgress {
}
interface SkillPoints {
}
interface MasteryLevel {
}
interface Specialization {
}
interface SkillReset {
}

### Synergies & Combos

interface SkillSynergy {
}
interface SkillCombo {
}
interface ComboEffect {
}
interface SynergyBonus {
}

## Key Behaviors

- Skills unlock through leveling, quests, trainers, or discovery
- Skill trees provide branching paths for specialization
- Prerequisites gate advanced skills behind foundational ones
- Synergies reward complementary skill combinations
- Skill mastery unlocks enhanced versions of abilities
- Skill resets allow respec with appropriate costs

## Dependencies

- `epic-character-core-system.md` (character stats, levels)
- `epic-magic-spell-systems.md` (spell skills)
- `specs/skills.md` (full design spec)
