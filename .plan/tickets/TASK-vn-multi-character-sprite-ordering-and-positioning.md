<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: multi-character sprite ordering and positioning

**Status:** ✅ Complete (2026-09-10) — deterministic slots per cast size with z-order, stage renders for 2+ cast, solo scenes keep the legacy portrait
**Priority:** medium
**Epic:** Avatar Alpha Channel + VN Layering; Visual Novel Mode
**Effort:** Medium

## Summary

Stage layout for 2+ sprites: ordered slots (far-left/left/center/right/far-right), depth/z-order layering, repositioning driven by message speaker and scene events, animated position transitions (transition-engine reuse). Supersedes single-portrait role-based logic in getPortraitPosition (src/frontend/vn/portrait-manager.ts). Works with sprite transform context anchor+scale (epic-asset-transform-metadata AV7). Acceptance: deterministic slot assignment per cast size, z-order rules (background < sprites < dialogue UI), no overlap collisions, transition unit tests.

## Acceptance Criteria

- [x] Implementation complete — `assignStageSlots` (centered layouts for 1–5 sprites, extras stay off-stage, active sprite lifts above the row under dialogue UI); `scene-renderer/stage.ts` composes `.vn-stage` (split out of `render-scene.ts` to respect the 250L strict gate); `render-scene.ts` renders stage or legacy portrait exclusively; flex row + slot `order` prevents overlap collisions. `getPortraitPosition` kept for the solo path (no caller migration needed); anchor+scale transform context (AV7) deferred to the anchor ticket
- [x] Tests passing — slot determinism, hidden/off-stage capping, and stage-vs-portrait exclusivity in `sprite-stage.test.ts` + `stage.test.ts`; full `bun run check` green at CHECK_JOBS=2
- [x] Documentation updated — JSDoc on `createStage`/`assignStageSlots`; slot/z-order rules recorded here
