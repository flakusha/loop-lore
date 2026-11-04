// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Touch Gesture Utilities
 *
 * Provides swipe, tap, long-press, pinch and pull detection for touch
 * interfaces. Respects prefers-reduced-motion; degrades to click events when
 * motion is reduced.
 *
 * Every detector joins the shared session in `touch-session.ts`: they all
 * measure against the same start point and only one of them owns the
 * gesture, so a pinch, a pull and a swipe never fire together.
 *
 * WCAG 2.1 — all gestures have keyboard/click alternatives.
 */
import {
  beginSession,
  claimOf,
  claimPinch,
  clearSession,
  type GestureSession,
  hasTextSelection,
  isBlocked,
  markMoved,
  updateClaim,
} from "./touch-session";

/** Direction of a horizontal swipe. */
export type SwipeDirection = "left" | "right";

/** */
export interface SwipeOptions {
  /** Minimum distance in px to register a swipe (default: 50) */
  threshold?: number;
  /** Maximum time in ms for a swipe gesture (default: 300) */
  maxDuration?: number;
  /** Called on swipe */
  onSwipe: (direction: SwipeDirection, delta: { x: number; y: number },) => void;
}

/** */
export interface TapOptions {
  /** Called on tap */
  onTap: (event: Event,) => void;
}

/** */
export interface LongPressOptions {
  /** Delay in ms before long-press fires (default: 500) */
  delay?: number;
  /** Called on long-press */
  onLongPress: (event: Event,) => void;
}

/** */
export interface PinchOptions {
  /** Relative scale change that counts as a pinch (default: 0.1) */
  threshold?: number;
  /** Called with the live scale ratio (current distance / start distance) */
  onPinch: (event: Event, scale: number,) => void;
}

/** */
export interface PullOptions {
  /** Minimum downward travel in px before a pull registers (default: 80) */
  threshold?: number;
  /** Called with the downward travel in px */
  onPull: (event: Event, distance: number,) => void;
}

/** Strength of a haptic pulse. */
export type HapticType = "light" | "medium" | "heavy";

/** Pulse duration in ms per haptic strength. */
const HAPTIC_DURATION_MS: Record<HapticType, number> = { light: 10, medium: 20, heavy: 40, };

/** Travel (px) that cancels a pending long-press. */
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

/** Check if user prefers reduced motion */
function prefersReducedMotion(): boolean {
  const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)",);
  return query?.matches ?? false;
}

/** Handler for each phase of a touch interaction. */
interface TouchHandlers {
  /** Fires when a touch lands. */
  start: EventListener;
  /** Fires while the touch travels. */
  move: EventListener;
  /** Fires when the touch lifts. */
  end: EventListener;
  /** Fires when the browser takes the touch over. */
  cancel: EventListener;
}

/**
 * Register the four touch listeners a detector needs and return the cleanup.
 * @param element - Element to listen on.
 * @param handlers - Handler per touch phase.
 * @returns {() => void} Cleanup that removes every listener again.
 */
function listenTouch(element: Element, handlers: TouchHandlers,): () => void {
  element.addEventListener("touchstart", handlers.start, { passive: true, },);
  element.addEventListener("touchmove", handlers.move, { passive: true, },);
  element.addEventListener("touchend", handlers.end, { passive: true, },);
  element.addEventListener("touchcancel", handlers.cancel, { passive: true, },);

  return () => {
    element.removeEventListener("touchstart", handlers.start,);
    element.removeEventListener("touchmove", handlers.move,);
    element.removeEventListener("touchend", handlers.end,);
    element.removeEventListener("touchcancel", handlers.cancel,);
  };
}

/** The travel of a touch interaction, measured from the session's start point. */
interface SessionTravel {
  /** The touchmove event that carried the travel. */
  event: Event;
  /** Horizontal travel from the start point (px). */
  dx: number;
  /** Vertical travel from the start point (px). */
  dy: number;
}

/** The detector's part of the shared touch session lifecycle. */
interface SessionLifecycle {
  /** How many touches must be down before the session starts (default: 1). */
  touches?: number;
  /** Called once the session has started. */
  start?: (event: Event, session: GestureSession,) => void;
  /** Called while the pointer travels. */
  move?: (travel: SessionTravel,) => void;
  /** Called when the touch lifts, after the session ended. */
  end?: (event: Event, session: GestureSession | undefined,) => void;
  /** Called when the browser takes the touch over, after the session ended. */
  cancel?: (event: Event, session: GestureSession | undefined,) => void;
  /** Called when the detector is disposed. */
  dispose?: () => void;
}

/**
 * Listen for one detector's touch session on an element.
 *
 * Every detector repeats the same lifecycle: a touchstart opens the
 * session, a touchmove measures the travel from the start point, and the
 * touchend/touchcancel ends it. Only the thresholds and the claim
 * arbitration differ, and those live in the hooks.
 * @param element - Element to listen on.
 * @param hooks - The detector's part of the lifecycle.
 * @returns {() => void} Cleanup that removes every listener again.
 */
function listenTouchSession(element: Element, hooks: SessionLifecycle,): () => void {
  const required = hooks.touches ?? 1;
  let session: GestureSession | undefined;

  const onStart = (e: Event,): void => {
    const touches = (e as TouchEvent).touches;
    const touch = touches[0];
    // The required touches must be there, not merely counted.
    if (!touch || !touches[required - 1]) { return; }
    const current = beginSession(element, touch,);
    session = current;
    hooks.start?.(e, current,);
  };

  const onMove = (e: Event,): void => {
    const touch = (e as TouchEvent).touches[0];
    if (!touch || !session) { return; }
    hooks.move?.({ event: e, dx: touch.clientX - session.startX, dy: touch.clientY - session.startY, },);
  };

  const onEnd = (e: Event,): void => {
    clearSession(element,);
    hooks.end?.(e, session,);
  };

  const onCancel = (e: Event,): void => {
    clearSession(element,);
    hooks.cancel?.(e, session,);
  };

  const removeListeners = listenTouch(element, {
    start: onStart as EventListener,
    move: onMove as EventListener,
    end: onEnd as EventListener,
    cancel: onCancel as EventListener,
  },);

  return () => {
    hooks.dispose?.();
    removeListeners();
  };
}

/**
 * Attach swipe detection to an element.
 *
 * Only horizontal swipes register: a vertical-dominant drag belongs to the
 * pull/scroll, and a pinch claims the gesture, so neither fires a swipe.
 * Returns a cleanup function.
 * @param element
 * @param options
 * @returns {() => void}
 */
export function onSwipe(element: Element, options: SwipeOptions,): () => void {
  const { threshold = 50, maxDuration = 300, onSwipe: callback, } = options;

  let startTime = 0;

  return listenTouchSession(element, {
    start: () => {
      startTime = Date.now();
    },
    move: ({ dx, dy, },) => {
      updateClaim(element, { dx, dy, threshold, },);
    },
    end: (e, current,) => {
      const claim = claimOf(element,);
      const blocked = isBlocked(element,);
      const touch = (e as TouchEvent).changedTouches[0];
      if (!touch || !current) { return; }
      // A gesture over a text selection is a no-op.
      if (blocked) { return; }
      if (claim === "pinch" || claim === "vertical") { return; }
      if (Date.now() - startTime > maxDuration) { return; }
      const dx = touch.clientX - current.startX;
      const dy = touch.clientY - current.startY;
      if (Math.abs(dx,) < threshold) { return; }
      // A vertical-dominant drag is a scroll/pull, never a swipe.
      if (Math.abs(dx,) <= Math.abs(dy,)) { return; }
      callback(dx > 0 ? "right" : "left", { x: dx, y: dy, },);
    },
  },);
}

/**
 * Attach tap detection to an element.
 * Uses click as fallback for reduced-motion or non-touch devices.
 * Returns a cleanup function.
 * @param element
 * @param options
 * @returns {() => void}
 */
export function onTap(element: Element, options: TapOptions,): () => void {
  const { onTap: callback, } = options;

  const handler = (e: Event,): void => {
    callback(e,);
  };

  if (prefersReducedMotion() || !("ontouchstart" in globalThis)) {
    element.addEventListener("click", handler,);
    return () => element.removeEventListener("click", handler,);
  }

  element.addEventListener("touchend", handler as EventListener, { passive: true, },);
  return () => element.removeEventListener("touchend", handler as EventListener,);
}

/**
 * Attach long-press detection to an element.
 *
 * The press is cancelled once the pointer travels past the movement
 * tolerance (10px); a small jitter keeps the press alive.
 * Returns a cleanup function.
 * @param element
 * @param options
 * @returns {() => void}
 */
export function onLongPress(element: Element, options: LongPressOptions,): () => void {
  const { delay = 500, onLongPress: callback, } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelPress = (): void => {
    if (timer === null) {
      return;
    }

    clearTimeout(timer,);
    timer = null;
  };

  return listenTouchSession(element, {
    start: (e,) => {
      // A gesture over a text selection is a no-op.
      if (isBlocked(element,)) { return; }
      // A second finger joins the interaction, it does not restart the press.
      if (timer !== null) { return; }
      timer = setTimeout(() => {
        timer = null;
        // A pinch is a deliberate two-pointer gesture, not a long press.
        if (claimOf(element,) === "pinch") { return; }
        // The press may have started a text selection - picking text is not a
        // long press.
        if (hasTextSelection()) { return; }
        callback(e,);
      }, delay,);
    },
    move: ({ dx, dy, },) => {
      const moved = markMoved(element, { dx, dy, threshold: LONG_PRESS_MOVE_TOLERANCE_PX, },);
      if (moved) { cancelPress(); }
    },
    end: cancelPress,
    cancel: cancelPress,
    dispose: () => {
      cancelPress();
      clearSession(element,);
    },
  },);
}

/**
 * Attach two-finger pinch detection to an element.
 *
 * The scale ratio is reported once it deviates from 1 by more than the
 * threshold. A pinch claims the gesture, so the swipe and pull detectors
 * stay silent for the same interaction.
 * Returns a cleanup function.
 * @param element
 * @param options
 * @returns {() => void}
 */
export function onPinch(element: Element, options: PinchOptions,): () => void {
  const { threshold = 0.1, onPinch: callback, } = options;

  let startDistance = 0;

  const resetDistance = (): void => {
    startDistance = 0;
  };

  return listenTouchSession(element, {
    touches: 2,
    start: (e,) => {
      const first = (e as TouchEvent).touches[0];
      const second = (e as TouchEvent).touches[1];
      if (!first || !second) { return; }
      // A gesture over a text selection is a no-op.
      if (isBlocked(element,)) { return; }
      claimPinch(element,);
      startDistance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY,);
    },
    move: ({ event, },) => {
      const first = (event as TouchEvent).touches[0];
      const second = (event as TouchEvent).touches[1];
      if (!first || !second || startDistance === 0) { return; }
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY,);
      const scale = distance / startDistance;
      if (Math.abs(scale - 1,) <= threshold) { return; }
      callback(event, scale,);
    },
    end: resetDistance,
    cancel: resetDistance,
  },);
}

/**
 * Attach pull-down detection to an element.
 *
 * A pull only registers at the top of the scroll container (scrollTop 0),
 * so it never fights native scrolling mid-list, and it claims the gesture
 * as vertical.
 * Returns a cleanup function.
 * @param element
 * @param options
 * @returns {() => void}
 */
export function onPull(element: Element, options: PullOptions,): () => void {
  const { threshold = 80, onPull: callback, } = options;

  let fired = false;

  return listenTouchSession(element, {
    start: () => {
      fired = false;
    },
    move: ({ event, dy, },) => {
      if (fired) { return; }
      // A gesture over a text selection is a no-op.
      if (isBlocked(element,)) { return; }
      if (dy < threshold) { return; }
      const claim = claimOf(element,);
      if (claim === "pinch" || claim === "horizontal") { return; }
      if (element.scrollTop !== 0) { return; }
      // A pull is a vertical claim: the horizontal component is ignored.
      updateClaim(element, { dx: 0, dy, threshold, },);
      fired = true;
      callback(event, dy,);
    },
  },);
}

/**
 * Fire a short haptic pulse when the device supports it.
 *
 * No-op under prefers-reduced-motion and on devices without
 * navigator.vibrate.
 * @param type - Pulse strength.
 * @returns {void}
 */
export function hapticFeedback(type: HapticType,): void {
  if (prefersReducedMotion()) { return; }
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav || typeof nav.vibrate !== "function") { return; }
  nav.vibrate(HAPTIC_DURATION_MS[type],);
}
