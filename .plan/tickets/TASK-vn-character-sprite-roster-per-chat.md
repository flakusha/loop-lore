<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: character sprite roster per chat

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Complete (2026-09-10) — per-chat roster lives in scene-renderer state, synced on init/addScene, cleared on destroy
**Priority:** medium
**Epic:** Avatar Alpha Channel + VN Layering; Visual Novel Mode

## Summary

Per-chat sprite roster: registry of cast members present in a VN scene, each mapped to its sprite assets (base + per-emotion/mood variants from emotion-avatar pipeline), visibility, and active-slot assignment. Extends src/frontend/vn/portrait-manager.ts (currently single-portrait, role-based only). Data: roster state in chat VN settings / scene state; reuses asset linking. Acceptance: roster CRUD per character, emotion-variant resolution, active cast selection per scene, ownership checks on routes.

## Acceptance Criteria

- [x] Implementation complete — `src/frontend/vn/sprite-stage.ts` (roster CRUD, visibility, emotion-variant fallback to base sprite); `scene-renderer/state.ts` holds the per-chat roster; `controller.ts` syncs on init/addScene and clears on destroy; scenes carry `cast`/`speakerId`/`emotion` via `msgToScene` (single-speaker entries synthesized, narration yields empty cast)
- [x] Tests passing — `sprite-stage.test.ts` (roster CRUD, variant fallback, unknown-id reports) plus `stage.test.ts` and updated `render`/`controller` contract tests; full `bun run check` green at CHECK_JOBS=2
- [x] Documentation updated — JSDoc on all stage exports; ownership checks on routes not needed (frontend-only, no new routes; asset URLs reuse the existing thumb route)
