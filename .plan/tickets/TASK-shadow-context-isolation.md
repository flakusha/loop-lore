<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shadow context isolation — no cross-system leaks

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-hidden-carriage-context.md
**See also:** epic-gm-shadow-notes.md, epic-quests-encounters.md
**Status:** Open
**Priority:** High

## Scope

- Every injectable entry carries `{ system, visibility }`; visibility
  classes: `player`, `gm`, `debug`. The assembler strips non-visible
  entries server-side for the requesting role — GM/shadow entries never
  reach player prompts, quest tracker reads never see shadow notes,
  carriage never ingests shadow content (no spoiler feedback loop).
- Enforcement in the assembler, not the UI: frontend only hides
  affordances. GM stores (`src/db/schema-gm.ts` surface) are queried
  only on GM-authorized paths.
- Tests assert payload absence at network/prompt level for the player
  role, plus cross-system negative reads (shadow → quest, shadow →
  carriage both empty).

## Acceptance

- Player prompt build contains zero `gm`-class entries (failing test
  exists before the fix lands).
- Quest/carriage pipelines return empty for shadow-scoped queries.
