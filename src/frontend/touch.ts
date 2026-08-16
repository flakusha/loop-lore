// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Touch Gesture Utilities
 *
 * Provides swipe, tap, and long-press detection for touch interfaces.
 * Respects prefers-reduced-motion; degrades to click events when motion is reduced.
 *
 * WCAG 2.1 — all gestures have keyboard/click alternatives.
 */

export type SwipeDirection = "left" | "right" | "up" | "down";

export interface SwipeOptions {
  /** Minimum distance in px to register a swipe (default: 50) */
  threshold?: number;
  /** Maximum time in ms for a swipe gesture (default: 300) */
  maxDuration?: number;
  /** Called on swipe */
  onSwipe: (direction: SwipeDirection, delta: { x: number; y: number },) => void;
}

export interface TapOptions {
  /** Called on tap */
  onTap: (event: Event,) => void;
}

export interface LongPressOptions {
  /** Delay in ms before long-press fires (default: 500) */
  delay?: number;
  /** Called on long-press */
  onLongPress: (event: Event,) => void;
}

/** Check if user prefers reduced motion */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)",).matches;
}

/**
 * Attach swipe detection to an element.
 * Returns a cleanup function.
 */
export function onSwipe(element: Element, options: SwipeOptions,): () => void {
  const { threshold = 50, maxDuration = 300, onSwipe: callback, } = options;

  let startX = 0;
  let startY = 0;
  let startTime = 0;

  const onStart = (e: Event,): void => {
    const touch = (e as TouchEvent).touches[0];
    if (!touch) { return; }
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
  };

  const onEnd = (e: Event,): void => {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDuration) { return; }

    const touch = (e as TouchEvent).changedTouches[0];
    if (!touch) { return; }
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const absDx = Math.abs(dx,);
    const absDy = Math.abs(dy,);

    if (absDx < threshold && absDy < threshold) { return; }

    let direction: SwipeDirection;
    if (absDx > absDy) {
      direction = dx > 0 ? "right" : "left";
    } else {
      direction = dy > 0 ? "down" : "up";
    }

    callback(direction, { x: dx, y: dy, },);
  };

  element.addEventListener("touchstart", onStart as EventListener, { passive: true, },);
  element.addEventListener("touchend", onEnd as EventListener, { passive: true, },);

  return () => {
    element.removeEventListener("touchstart", onStart as EventListener,);
    element.removeEventListener("touchend", onEnd as EventListener,);
  };
}

/**
 * Attach tap detection to an element.
 * Uses click as fallback for reduced-motion or non-touch devices.
 * Returns a cleanup function.
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
 * Falls back to right-click context menu for non-touch / reduced-motion.
 * Returns a cleanup function.
 */
export function onLongPress(element: Element, options: LongPressOptions,): () => void {
  const { delay = 500, onLongPress: callback, } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;

  const onStart = (e: Event,): void => {
    timer = setTimeout(() => {
      callback(e,);
      timer = null;
    }, delay,);
  };

  const onCancel = (): void => {
    if (timer === null) {
      return;
    }

    clearTimeout(timer,);
    timer = null;
  };

  element.addEventListener("touchstart", onStart as EventListener, { passive: true, },);
  element.addEventListener("touchmove", onCancel, { passive: true, },);
  element.addEventListener("touchend", onCancel, { passive: true, },);
  element.addEventListener("touchcancel", onCancel, { passive: true, },);

  return () => {
    onCancel();
    element.removeEventListener("touchstart", onStart as EventListener,);
    element.removeEventListener("touchmove", onCancel,);
    element.removeEventListener("touchend", onCancel,);
    element.removeEventListener("touchcancel", onCancel,);
  };
}
