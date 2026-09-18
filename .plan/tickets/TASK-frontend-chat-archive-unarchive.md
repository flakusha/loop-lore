<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Chat Unarchive

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation
**Related:** TASK-message-archive-restore-frontend, TASK-archival-workflow
**Source:** FE-BE harmonization check, 2026-09-17 — 1 route in this slice.

## Summary

Expose the `POST /api/chats/:id/unarchive` route on the archived-chat view. The
chat list / archive view has no caller today.

## Backend surface

| Method | Path | File |
|--------|------|------|
| POST | `/api/chats/:id/unarchive` | `src/routes/chats/archive-routes.ts:46` |

## Acceptance Criteria

- [ ] Archived-chat list shows an "Unarchive" action that POSTs to the route
- [ ] Optimistic update on success; revert on error
- [ ] CSRF + auth headers wired through `feFetch`
- [ ] `bun run check` green
