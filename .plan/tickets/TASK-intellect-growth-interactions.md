<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Intellectual & skill-growth interactions (/study /meditate /practice /translate)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-character-growth

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Intellectual & Skill Growth category: character development and knowledge acquisition. Depends on `TASK-interaction-service-foundation`.

## Scope

- `/study` — read books/tablets to learn lore or solve puzzles; `/meditate` — focused thought (stress down, mana regen up); `/practice` — repeated training raising proficiency; `/translate` — decipher foreign writing/symbols.
- **Naming conflict:** `/translate` already exists as a text-translation command (`src/assistant/commands/translate.ts`). Decide: extend the existing command with an in-world decipher mode when a target object/lore reference is present, or namespace the RPG verb. Extension preferred — same UX surface, context-dependent behavior.
- Time-based cost model (progression over repeated use, not instant).

## Acceptance Criteria

- [ ] Verbs registered with Intelligence/Will skill matrix entries
- [ ] `/translate` conflict resolved: single command, context-dependent behavior, existing tests pass
- [ ] `/practice` measurably raises tracked skill proficiency over sessions
- [ ] Tests: proficiency progression, translate mode selection

## Linked Epics

- `epic-character-growth.md`
- `epic-rpg-progression.md` (skill canonical definition)
