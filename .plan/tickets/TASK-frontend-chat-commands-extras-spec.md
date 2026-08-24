<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend Chat Commands & Extras Implementation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Related:** docs/frontend/chat/commands-and-misc.md
**git issue:** 273bcfa

## Summary

Implement chat commands, keyboard shortcuts, image-generation pipeline, and
system/narration message rendering per `docs/frontend/chat/commands-and-misc.md`
— currently an untracked spec (no `.plan/` ticket or epic references it).

## Context

`docs/frontend/chat/commands-and-misc.md` defines the UX but has **zero**
`.plan/` linkage (discovered during docs↔planning audit). Spec covers: keyboard
shortcuts, `/` chat command palette, group-chat (in progress), world background
(future), image-generation pipeline, and system/narration message display
philosophy. Group-chat command surface overlaps `epic-frontend-backend-integration`
and `TASK-group-chat-*` tickets; this ticket scopes the command/extras UI only.

## Acceptance Criteria

- [ ] `/` command palette renders per spec
- [ ] Keyboard shortcuts wired + documented in UI
- [ ] Image-generation pipeline UI matches spec
- [ ] System/narration messages styled per display philosophy
- [ ] `bun run check` green; manual UI smoke pass
- [ ] Ticket linked from `docs/frontend/chat/commands-and-misc.md`
