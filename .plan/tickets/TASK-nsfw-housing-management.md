<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Housing Management

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Task
**Tags:** nsfw, frontend, ui, housing
**Epic:** epic-nsfw-ui

## Summary

Housing management interface for base building.

> **Moved to `epic-housing.md`** — housing is a standalone domain, not an NSFW sub-feature. See `TASK-housing-frontend.md` for the housing UI.

## Core Features

- Room layout display
- Furniture placement
- Room assignment
- Housing conditions

## Acceptance Criteria

> NSFW-owned slice only (2026-11-09). Room layout / furniture / room
> assignment / conditions belong to `epic-housing` (`TASK-housing-frontend`,
> blocked on `/api/housing/*` which does not exist).

- [x] Private-space suitability view over the existing gated `GET /api/v1/nsfw/location/:locationId` (`src/frontend/nsfw/private-space.ts:fetchLocationConfig/toPrivateSpaceView/renderPrivateSpace`)
- [x] Consent-denied stays denied (403 → `denied`, panel hidden; `private-space.test.ts` fetch gate block)
- [x] Mobile responsive (verdict stacks under the 480px breakpoint, `src/public/css/app.css`)
- [ ] Room layout visualization (epic-housing)
- [ ] Furniture placement interface (epic-housing)
- [ ] Room assignment — NPCs, functions (epic-housing)
- [ ] Housing conditions and effects (epic-housing)

## Files to Create

- `src/frontend/alpine/housing.ts`
- `src/components/housing/room-layout.html`

## Related

- `epic-housing.md` — Housing epic (owner)
- `TASK-housing-frontend.md` — Housing UI task

**Resolved:** 2026-11-09 registry-driven close: git issue da34ef5 (registry tip: 389d0ea11 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-NSFW-HOUSING-MANAGEMENT don)
