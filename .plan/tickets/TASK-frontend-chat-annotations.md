<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Chat Annotations (notes/shadow/quest)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-chat-product-features
**Related:** TASK-quest-tracking-notes-shadow, TASK-shadow-context-isolation
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes. Backend route file
(`src/routes/chats/annotations.ts:14`) explicitly notes "Frontend wiring is
intentionally out of scope for this slice." — see comment header.

## Summary

Wire the chat annotations surface (GM-style notes/shadow/quest). The backend slice
shipped with a deliberate gap: no frontend caller. Add the chat-side annotations
panel that lists + creates annotations on the chat.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/chats/:id/annotations` | `src/routes/chats/annotations.ts:107` |
| POST | `/api/chats/:id/annotations` | `src/routes/chats/annotations.ts:46` |

## Acceptance Criteria

- [ ] Chat-side annotations drawer/panel surfaces list on open
- [ ] POST form validates `kind ∈ {note, shadow, quest}` (server is source of truth; client matches)
- [ ] Empty / error states handled
- [ ] Drawer accessible from chat toolbar
- [ ] `bun run check` green; FE-BE checker shows 0 blocking
