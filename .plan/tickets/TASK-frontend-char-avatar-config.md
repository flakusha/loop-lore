<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Character Avatar Config (world-scoped per-actor)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-character-core-system
**Related:** TASK-actor-emotion-avatars-frontend, TASK-wardrobe-frontend-manager-on-character-sheet-outfit-switcher
**Source:** FE-BE harmonization check (`.tmp/fe-be-harmony.json`), 2026-09-17 — 244 BE-no-FE entries; 2 routes in this slice.

## Summary

Wire frontend callers for the per-actor avatar configuration endpoints. Currently the
backend exposes GET/PUT for `worlds/:worldId/avatars/config/:actorId` but the web UI
has no caller.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/worlds/:worldId/avatars/config/:actorId` | `src/routes/character-avatars/config.ts:92` |
| PUT | `/api/worlds/:worldId/avatars/config/:actorId` | `src/routes/character-avatars/config.ts:120` |

## Acceptance Criteria

- [ ] Web UI exposes a "Per-world avatar config" panel on the character/world sheet
- [ ] GET wired via `feFetch` (or `apiFetch`) on mount
- [ ] PUT wired through the form save flow with CSRF + auth headers
- [ ] Owner-only (worldId owner / actorId owner) gate surfaced in UI (disable / hide when unauthorized)
- [ ] `bun run check` green; `bun run scripts/check-fe-be-harmonization.ts` shows 0 blocking for this slice
