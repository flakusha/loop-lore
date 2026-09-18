<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Relaxed shadow visibility for debug and assistant flows

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-hidden-carriage-context.md
**See also:** epic-gm-shadow-notes.md, epic-assistant-gm-flows.md
**Status:** Open
**Priority:** Medium

## Scope

- Debug sessions (dev flag / `?` affordance) and assistant continuation
  flows may request `gm`-class entries: assembler includes them explicitly
  marked as shadow, read-only — they inform generation/debugging but
  are never written back into player-visible stores (notes, quests,
  carriage approved state).
- Write-back guard: any pipeline carrying shadow-marked entries rejects
  persistence to player-scoped tables; violation surfaces a dev warning.

## Acceptance

- Assistant `/continue` sees shadow context; resulting player-visible
  writes contain no shadow-derived facts (asserted by test).
- Debug view labels every shadow entry; no silent mixing.
