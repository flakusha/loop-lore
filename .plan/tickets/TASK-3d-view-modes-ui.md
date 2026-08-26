<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-3d-view-modes-ui: VRM view-mode switching + device-tier gating (Phase 5)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** TASK
**Tags:** 3d, view-mode, webgl, threejs
**Epic:** Epic 26 (Avatar & Expression), Epic 28 (Asset Support)
**Parent:** TASK-3d-view-modes (umbrella)

## Summary

Three view modes for the 3D avatar — permanent panel, collapsible panel, inline
preview — plus device-tier gating that falls back to the 2D avatar path on Low-tier
devices. Renders through the Phase 1–2 pipeline. Consolidates the Phase 5 view-mode
work of the former `TASK-3d-view-modes.md`.

## Context (shared)

View modes introduced in the parent:

**1. Permanent Panel** — always-visible side panel (default 280px, configurable
200–400px) with the 3D avatar rendered continuously; reacts to chat events.

**2. Collapsible Panel** — 300px panel sliding from the right via a chat-header
toggle; renders on open, disposes the WebGL context on close.

**3. Inline Preview** — 48×48px static snapshot inside message bubbles; click to
expand into the collapsible panel/modal (WebGL → 2D texture).

Device Tier Gating (from parent): High/Medium tiers get full 3D; the Low tier
(`src/frontend/alpine/device-tier.ts`) falls back to 2D (TASK-avatars-dynamic-2d).

## Tasks

### Phase 5: View Modes

- [ ] Create `src/frontend/3d/view-modes.ts` — view mode manager
- [ ] Implement permanent panel (always rendered, configurable width)
- [ ] Implement collapsible panel (render on open, dispose on close)
- [ ] Implement inline preview (static snapshot, click to expand)
- [ ] Add toggle button in chat header
- [ ] Add panel width setting (localStorage)
- [ ] Wire to device tier (low = 2D fallback)

## Files to Create

- `src/frontend/3d/view-modes.ts` — permanent/collapsible/inline manager
- `src/frontend/3d/styles.css` — 3D panel styles

## Files to Modify

- `src/views/chat.html` — 3D panel containers
- `src/frontend/alpine/chat.ts` — 3D state binding
- `src/frontend/alpine/device-tier.ts` — tier gating (exists)

## Dependencies

- Parent hub: `TASK-3d-view-modes.md`
- **After:** TASK-3d-vrm-foundation (renders through its pipeline).
- Siblings: TASK-3d-gltf-assets assets surface in previews; gating hands off to
  TASK-avatars-dynamic-2d on the Low tier; TASK-3d-performance optimizes the render.

## Acceptance Criteria

- [ ] Permanent panel shows 3D avatar alongside chat
- [ ] Collapsible panel opens/closes with proper lifecycle
- [ ] Inline preview shows static snapshot
- [ ] Device tier gating: low devices get 2D fallback
