<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Skill-check slash commands (/pick_pocket, /disarm, /climb, /swim, /trap_check)

**Summary:** No interaction commands resolve through the character's skills; the dice engine does not consume Skill.value or AbilityScore.modifier. Add skill-check slash commands that roll against the relevant skill with ability-derived modifiers, integrated with the existing dice/RPG command surface.
**Context:** Read-side integration ticket for epic-character-world-integration.md. Character skills live in character_skills (src/rpg/skills/service); AbilityScore from src/characters/spec/character.ts; command plumbing pattern follows existing slash commands in the assistant/commands layer.
**Acceptance Criteria:** Each command maps to a skill + ability; roll = dice + Skill.value-derived bonus + AbilityScore.modifier; failure paths produce narrated consequences (condition or reputation event) rather than silent denial; prompt section records the check result; tests cover success/critical/failure and unknown-skill fallback.

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Spec: src/characters/spec/character.ts (AbilityScore, Skill), src/rpg/skills/service/
- Depends on: TASK-shared-character-domain-models

**Branch:** open on dev.
