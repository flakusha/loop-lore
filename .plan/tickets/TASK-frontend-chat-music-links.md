<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Chat Music Links

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-ambient-music-sfx
**Source:** FE-BE harmonization check, 2026-09-17 — 3 routes in this slice.

## Summary

Wire the chat-scoped music-link CRUD UI (list/create/delete). Backend endpoints
exist; no web UI caller.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/chats/:id/music-links` | `src/routes/music-links.ts:96` |
| POST | `/api/chats/:id/music-links` | `src/routes/music-links.ts:45` |
| DELETE | `/api/music-links/:id` | `src/routes/music-links.ts:124` |

## Acceptance Criteria

- [ ] Chat ambient/ambience panel lists music links
- [ ] "Add music link" form posts to backend
- [ ] Delete action with confirm
- [ ] Links rendered as playable UI
- [ ] `bun run check` green
