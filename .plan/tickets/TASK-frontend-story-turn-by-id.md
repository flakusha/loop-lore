<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Story Turn By-ID Lookup

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-story-mode-ui
**Related:** TASK-story-turn-order, TASK-timeline-id-world-timeline-events
**Source:** FE-BE harmonization check, 2026-09-17 — 1 route in this slice.

## Summary

Wire the per-story-turn lookup so the timeline / story panel can deep-link into a
specific turn.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/chats/:id/story-turns/:turnId` | `src/routes/story-turns.ts:98` |

## Acceptance Criteria

- [ ] Story/timeline panel can deep-link to a specific turn
- [ ] Response renders in a turn detail view
- [ ] Cached per (chatId, turnId) on the client
- [ ] `bun run check` green
