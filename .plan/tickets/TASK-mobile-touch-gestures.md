<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Mobile Touch Gestures

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-accessibility-input

## Summary

Implement mobile touch gesture system with swipe, tap, long-press, and pinch gestures. Ensure touch targets are 44x44px minimum for WCAG 2.5.8 compliance.

> **2026-10-25 status note:** the previously checked swipe/long-press/fallback boxes below became real in the chat message list (`src/frontend/alpine/chat-touch-gestures.ts` — swipe left → archive dialog, swipe right → edit, long-press → context menu, no-touch fallback via the visible buttons; unit tests in `src/frontend/touch.test.ts` / `chat-touch-gestures.test.ts`).
>
> **2026-11-02 status note:** pull-to-refresh, haptics and gesture-conflict resolution landed on top of that work. `src/frontend/touch-session.ts` is the shared arbitration layer (one claim per element: horizontal / vertical / pinch), `src/frontend/touch.ts` gained `onPinch`, `onPull` and `hapticFeedback`, and `src/frontend/alpine/chat-touch-gestures.ts` attaches them to `#message-list`: a pull at the top of the list reloads it through `loadMessages`, haptics fire on swipe and long-press, and a pinch claims the gesture so it never also swipes or pulls. Pinch-to-zoom is still open — the chat view has no zoom/scale surface to drive, so the detector only reports the scale ratio.
>
> **2026-11-03 status note:** pinch-to-zoom now has a surface — the pinch zooms `#message-list` (the chat scroll container) through the CSS `zoom` property, clamped to [1, 2], with a keyboard alternative (Ctrl+= / Ctrl+- / Ctrl+0) and a reset when the chat changes or the list re-renders (`src/frontend/touch-zoom.ts`). The selectable-text carve-out closed as well: a gesture starting on selected text is a no-op for every detector (shared check in `src/frontend/touch-session.ts`).

## Acceptance Criteria

- [x] Touch targets 44x44px minimum
- [x] Swipe left/right for actions
- [x] Long press for context menu
- [x] Pull-to-refresh on lists (2026-11-02: `onPull` on `#message-list`, fires at `scrollTop === 0` past 80px of downward travel and reloads the list through `loadMessages`; skipped while an older-page load or a reload is in flight, so it cannot race the list's own infinite scroll at the same edge.)
- [x] Pinch zoom on maps/images (2026-11-03: the pinch zooms the chat message list — the chat scroll container — through the CSS `zoom` property, clamped to [1, 2]; the list holds the message text and the inline images, so both magnify while the sidebar and the composer stay anchored. No map surface exists in the chat.)
- [x] Haptic feedback for actions (2026-11-02: `hapticFeedback` fires on swipe and long-press; a no-op without `navigator.vibrate` and under prefers-reduced-motion.)
- [x] Gesture conflict resolution (2026-11-02: the shared session in `src/frontend/touch-session.ts` awards one claim per interaction — a pinch suppresses the swipe, a vertical-dominant drag belongs to the pull/scroll and never swipes.)
- [x] Fallback for devices without touch (2026-11-03: the visible buttons remain the fallback, and the zoom keyboard shortcuts are bound on every device, not only on touch-capable ones.)

## Implementation Details

### As implemented (2026-11-03)

The original sketch in this ticket (a `TouchGestureManager` class under
`src/frontend/a11y/`) was never implemented. What shipped instead:

- `src/frontend/touch.ts` — the gesture detectors `onSwipe`, `onTap`,
  `onPinch`, `onPull` and `onLongPress`, plus the `hapticFeedback` helper.
- `src/frontend/touch-session.ts` — the shared arbitration layer: one claim
  per interaction (horizontal / vertical / pinch) plus the selectable-text
  carve-out.
- `src/frontend/touch-zoom.ts` — the pinch-to-zoom surface: `#message-list`
  through the CSS `zoom` property, clamped to [1, 2], with the keyboard
  alternative Ctrl+= / Ctrl+- / Ctrl+0.
- `src/frontend/alpine/chat-touch-gestures.ts` — the wiring on
  `#message-list`: swipe left → archive-confirm dialog, swipe right → edit,
  long-press → context menu, pull → reload the list, pinch → zoom the list,
  plus the control carve-out (a gesture that starts on a button, link, form
  field or editable element is ignored).

### Touch Target Sizing

44px minimum touch targets are in place per component
(`src/public/css/app.css`, `src/public/css/mobile-keynav.css`); the generic
`button, a, input, ...` rule sketched here was not shipped.

## Files

- `src/frontend/touch.ts` — gesture detectors and haptics
- `src/frontend/touch-session.ts` — gesture arbitration and the selectable-text carve-out
- `src/frontend/touch-zoom.ts` — pinch-to-zoom surface
- `src/frontend/alpine/chat-touch-gestures.ts` — chat wiring and the control carve-out

## Related Tasks

- TASK-keyboard-navigation.md
- TASK-screen-reader-support.md
- TASK-responsive-design.md
