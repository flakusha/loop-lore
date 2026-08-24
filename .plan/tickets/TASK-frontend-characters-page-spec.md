<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend Characters Page Implementation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** (none — no dedicated frontend epic tracks this spec)
**Related:** docs/frontend/characters.md

## Summary

Implement the Characters page UI per `docs/frontend/characters.md`, which is
currently an untracked spec (no ticket or epic references it). Covers the
character list (`/characters`), create modal (`+ New`), and edit view
(`/characters/:id/edit`).

## Context

`docs/frontend/characters.md` defines the UX but has **zero** `.plan/` linkage
— no ticket or epic cites it (discovered during docs↔planning audit). The spec
describes: responsive character grid, left-column filter/actions, list/main-area
states, create-form sections + actions, and edit-view states. Existing character
work (e.g. `TASK-character-*` tickets) covers services/editor but not this page
shell, so this ticket closes the frontend-spec gap.

## Acceptance Criteria

- [ ] `/characters` list renders responsive grid with filter sidebar per spec
- [ ] `+ New` create modal matches form sections + actions in spec
- [ ] `/characters/:id/edit` edit view matches states in spec
- [ ] List/create/edit states (empty/loading/error) handled
- [ ] `bun run check` green; manual UI smoke pass
- [ ] Ticket linked from `docs/frontend/characters.md` (reverse linkage added)
