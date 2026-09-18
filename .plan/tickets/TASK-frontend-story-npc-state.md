<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Story NPC State GET/PUT

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-story-mode-ui
**Related:** TASK-story-world-state, TASK-npc-bdi-planning
**Source:** FE-BE harmonization check, 2026-09-17 — 2 routes in this slice.

## Summary

Wire the per-NPC story-state GET/PUT endpoints so the GM/Story panel can read and
modify NPC story state.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/worlds/:worldId/npc-states/:actorId` | `src/routes/story-states/npc.ts:29` |
| PUT | `/api/worlds/:worldId/npc-states/:actorId` | `src/routes/story-states/npc.ts:47` |

## Acceptance Criteria

- [ ] Story/GM panel can fetch per-NPC state on demand
- [ ] Edit form PUTs updates
- [ ] Optimistic update; revert on error
- [ ] Owner/GM-only gate surfaced in UI
- [ ] `bun run check` green
