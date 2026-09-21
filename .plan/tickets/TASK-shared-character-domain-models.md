<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shared character domain models for world systems

**Summary:** Character rich-extension types (AbilityScore, Skill, Condition, Motivation, Relationship, Vital, EquipmentSlot, SpeechPatterns) live only in src/characters/spec/character.ts with no consumption contract; world-system planning re-declares adjacent concepts. Promote them to shared domain contracts importable by world systems.
**Context:** Prerequisite for every ticket in epic-character-world-integration.md. Types currently spec-only per review 2026-09-21; runtime counterparts (rpg/skills Skill, relationships-service Relationship, rpg/combat conditions) exist in parallel and must converge.
**Acceptance Criteria:** Single authoritative module per model (src/characters/spec/ or promoted src/domain/); rpg skills/relationships/combat-conditions types unify onto it or map explicitly; no world module re-declares a character domain type; typecheck + tests green.

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Spec: src/characters/spec/character.ts:125-261
- Converge targets: src/rpg/skills/service/types.ts, src/characters/services/relationships-service/types.ts, src/rpg/combat/conditions.ts

**Branch:** open on dev.
