<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Chat Rename & Migrate Actions

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-chat-product-features
**Related:** TASK-wire-auto-rename, TASK-multi-session-support
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes in this slice.

## Summary

Wire the explicit chat rename (`POST /api/chats/:id/rename`) and chat migrate
(`POST /api/chats/:id/migrate`) endpoints to the chat toolbar.

## Backend surface

| Method | Path | File |
|--------|------|------|
| POST | `/api/chats/:id/rename` | `src/routes/chats/manage.ts:137` |
| POST | `/api/chats/:id/migrate` | `src/routes/chats/manage.ts:40` |

## Acceptance Criteria

- [ ] Chat toolbar exposes "Rename" + "Migrate" actions
- [ ] Both POST through `feFetch` with proper headers
- [ ] Confirm prompt for migrate (irreversible from user's POV)
- [ ] Optimistic update on success; revert on error
- [ ] `bun run check` green
