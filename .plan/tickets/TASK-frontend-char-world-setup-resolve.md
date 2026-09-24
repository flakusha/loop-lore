<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend — Character World Setup Resolution

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-character-world-setup
**Related:** TASK-world-locations, TASK-character-internal-traits
**Source:** FE-BE harmonization check, 2026-09-17 — 1 route in this slice.

## Summary

Wire the per-actor/per-world setup resolver call so the character sheet can pull
the resolved overlay configuration used by the runtime.

## Backend surface

| Method | Path | File |
|--------|------|------|
| GET | `/api/actors/:actorId/world-setup/:worldId/resolve` | `src/routes/character-world-setup.ts:61` |

## Acceptance Criteria

- [ ] Character sheet / world edit page calls GET on world-load
- [ ] Resolved payload surfaced in a read-only "Effective overlay" section
- [ ] Cache keyed by (actorId, worldId); invalidated on rotation
- [ ] `bun run scripts/check-fe-be-harmonization.ts` exits 0
