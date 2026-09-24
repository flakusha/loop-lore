<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-023: 3D view modes

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Three camera modes (orbit / first-person / cinematic) bound to a single control.
**Context:** Frontend view controller + camera state; persists in session and reflects in URL.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: done
**Priority**: medium
**Effort:** Medium
**Labels**: 3d, view-mode, frontend, immersion
**Assignee**:
**Epic**: epic-3d-generation
**Related**:

## Summary

Expose switchable 3D view modes (orbit, first-person, cinematic) across scene and chat-attached scenes with consistent camera state and persistence.

## Context

Scope is frontend view controllers and camera state management. Backend scene payloads already carry mode metadata; this ticket wires the UI. IN: mode switcher, camera reset, persistence per session. OUT: new asset import paths, physics, lighting bake.

## Acceptance Criteria

- [x] Three modes selectable from a single control: orbit, first-person, cinematic
- [x] Mode selection persists across navigation within a session and resets cleanly on scene change
- [x] Camera transitions between modes are eased (no jarring snap)
- [x] Switching modes does not unmount the scene or trigger a re-fetch
- [x] Mode is reflected in URL/query state so deep-links restore the chosen view

## Related Files

- src/views/three/
- src/components/3d/ViewModeSwitcher.vue (to be created)
- src/frontend/scene/

## Notes

- See epic-3d-generation for upstream asset/skeleton contracts
- Coordinate with BUG-avatar-select tickets for fallback rendering when 3D asset is missing

## Resolution

Shipped as Alpine (no Vue files): `src/components/3d/view-mode-switcher.html`
and `src/frontend/scene/view-mode.ts` (`viewMode()` x-data factory, included in
`chat.html` inside `#vn-container`). Review fix applied: the mode was previously
mirrored only onto the switcher buttons with no consumer — `view-mode.ts` now
writes `data-mode` onto the real scene container (`#vn-container`) on
set/reset/restore, and `vn.css` consumes it as the camera (first-person zoom
offset, cinematic slow pan, eased 350ms stage transition, all guarded by
`prefers-reduced-motion`; orbit = untouched default). Labels/aria are i18n'd
via `chat.viewMode` / `chat.viewModeLabel.*` / `chat.viewModeTitle.*` in all
10 locale files.

Git issue: `149948e`

Follow-up (2026-09-23): wired the missing `data-scene-id` writer — `syncVnRenderer`
now mirrors the active chat id onto `#vn-container` (`syncSceneId` in
`alpine/chat-settings/vn.ts`), and the view-mode watcher resets to orbit only on
scene swaps (initial attach preserves a restored/deep-linked camera). Tests:
`view-mode.test.ts`, `vn-scene-id.test.ts`.
