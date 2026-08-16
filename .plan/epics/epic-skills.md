<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Skills

**Status:** 🟢 Code+tests+schema done (migration 036); UNWIRED
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

## Wiring & Resolution Plan (2026-08-08 audit)

`SkillsService` (src/rpg/skills/, CRUD + tree + progression, backed by `character_skills`,
migration 036) is code-complete + tested but has ZERO external importers. Resolution: mount it
under `/api/rpg/skills` (CRUD + tree + progression) via the WIRED-7 mount pattern — tracked by
`TASK-wire-skills-routes`.
