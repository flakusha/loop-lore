<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-avatars-dynamic-2d: Dota-style dynamic 2D avatars (Phase 4)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** TASK
**Tags:** avatar, 2d, spine, dota-style
**Epic:** Epic 26 (Avatar & Expression)
**Parent:** TASK-3d-view-modes (umbrella)

## Summary

Animated 2D character mugshots (Dota-style) via Spine 2D / DragonBones — an
independent track from the Three.js 3D pipeline. On Low-tier devices this 2D path
is the fallback for the 3D avatar. Consolidates former
`TASK-dynamic-avatars-dota-style.md`.

## Context

Phase 4 of the consolidated 3D view-modes family. Does not require Three.js or
WebGL2; paired with the `Low` device tier (see parent's Device Tier Gating) as the
2D fallback. Expression state is driven by the same chat events the 3D avatars
react to (typing → alert, message → emotion).

## Tasks

### Phase 4: Dynamic 2D Avatars (Dota-style)

- [ ] Evaluate Spine 2D vs DragonBones (licensing, features)
- [ ] Create `src/frontend/avatar/avatar-machine.ts` — animation state machine
- [ ] Create `src/frontend/avatar/spine-renderer.ts` — Spine/DragonBones renderer
- [ ] Implement idle animation (breathing, blinking)
- [ ] Implement expression morph targets
- [ ] Add ambient particle system (fire, frost, magic aura)
- [ ] Add audio triggers (hover, select, expression change)
- [ ] Wire expression state to chat events (typing → alert, message → emotion)

## Files to Create

- `src/frontend/avatar/avatar-machine.ts` — 2D animation state machine
- `src/frontend/avatar/spine-renderer.ts` — Spine/DragonBones renderer
- `src/frontend/avatar/particle-system.ts` — ambient effects
- `src/frontend/avatar/audio-manager.ts` — spatial audio

## Dependencies

- Parent hub: `TASK-3d-view-modes.md`
- **Independent** of the Three.js pipeline (TASK-3d-vrm-foundation,
  TASK-3d-gltf-assets, TASK-3d-view-modes-ui, TASK-3d-performance); shares only the
  expression / chat-event vocabulary and is the Low-tier fallback target.

## Acceptance Criteria

- [ ] Spine 2D avatars animate (if implemented)
