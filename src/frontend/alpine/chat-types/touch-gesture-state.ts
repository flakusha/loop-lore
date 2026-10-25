// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Chat-page touch-gesture wiring state (epic-accessibility-input Phase 2). */
export interface ChatTouchGestureState {
  /** Element the gesture listeners are attached to (captured at setup). */
  _touchGesturesEl: Element | null;
  /** Cleanup fns for every listener registered by setupTouchGestures. */
  _touchGesturesCleanups: (() => void)[];
  /** Message row the active touch started on (delegated swipe target). */
  _touchSwipeTarget: Element | null;
  /** True when the active touch started on a control owning its own interaction. */
  _touchOnControl: boolean;
  /** Attach swipe/long-press handlers to #message-list (touch devices only). */
  setupTouchGestures(): void;
  /** Remove every gesture listener registered by setupTouchGestures. */
  teardownTouchGestures(): void;
}
