// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat list zoom - the pinch-to-zoom target of the touch gesture layer.
 *
 * The zoom is applied with the CSS `zoom` property, NOT `transform: scale()`:
 * `transform` does not take part in layout, so the scroll container would keep
 * its unscaled scrollHeight and the list would scroll wrong once zoomed.
 * `zoom` participates in layout, so the scroll geometry follows the factor.
 *
 * Only the message list is zoomed - the sidebar and the composer stay
 * anchored, which is the whole point of the chat-only zoom surface.
 *
 * WCAG 2.1 - the pinch gesture has a keyboard alternative (Ctrl+= / Ctrl+- /
 * Ctrl+0, plus the bare keys when no text field has focus).
 */

/** Lowest zoom factor - pinching inward clamps here. */
export const MIN_ZOOM = 1;
/** Highest zoom factor. */
export const MAX_ZOOM = 2;
/** Factor one keyboard zoom step adds or removes. */
export const ZOOM_STEP = 0.25;

/** Minimal view of the element that carries the zoom. */
export interface ZoomTarget {
  style: {
    setProperty(name: string, value: string,): void;
    getPropertyValue(name: string,): string;
  };
}

/** Minimal view of the key event the zoom shortcut reads. */
export interface ZoomKeyEvent {
  /** The pressed key ("=", "+", "-", "_" or "0"). */
  key: string;
  /** True while Ctrl is held. */
  ctrlKey?: boolean;
  /** True while the platform modifier is held. */
  metaKey?: boolean;
  /** Suppresses the browser's own handling of the key. */
  preventDefault?: () => void;
}

/** Minimal view of the scope the zoom shortcut is bound to. */
export interface ZoomKeyScope {
  /** The focused element (null when nothing is focused). */
  activeElement?: Element | null;
  /** Registers a keydown listener. */
  addEventListener(type: "keydown", listener: (event: ZoomKeyEvent,) => void,): void;
  /** Removes a keydown listener. */
  removeEventListener(type: "keydown", listener: (event: ZoomKeyEvent,) => void,): void;
}

/** Factor every live pinch of an element is measured against. */
const pinchBase = new WeakMap<object, number>();

/**
 * Clamp a zoom factor into the supported range.
 * @param factor - Requested factor.
 * @returns {number} The factor inside [MIN_ZOOM, MAX_ZOOM].
 */
export function clampZoom(factor: number,): number {
  if (!Number.isFinite(factor,)) { return MIN_ZOOM; }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor,),);
}

/**
 * The zoom factor currently applied to an element.
 * @param element - Zoomed element.
 * @returns {number} The applied factor (1 when nothing is zoomed).
 */
export function readZoom(element: ZoomTarget,): number {
  const factor = Number.parseFloat(element.style.getPropertyValue("zoom",),);
  return Number.isFinite(factor,) ? clampZoom(factor,) : MIN_ZOOM;
}

/**
 * Apply a zoom factor to an element.
 * @param element - Zoomed element.
 * @param factor - Requested factor.
 * @returns {number} The clamped factor that was applied.
 */
export function applyZoom(element: ZoomTarget, factor: number,): number {
  const clamped = clampZoom(factor,);
  element.style.setProperty("zoom", String(clamped,),);
  return clamped;
}

/**
 * Reset an element back to the unzoomed state.
 * @param element - Zoomed element.
 * @returns {void}
 */
export function resetZoom(element: ZoomTarget,): void {
  applyZoom(element, MIN_ZOOM,);
}

/**
 * Move the zoom by one step (a positive delta zooms in).
 * @param element - Zoomed element.
 * @param delta - Factor to add.
 * @returns {number} The clamped factor that was applied.
 */
export function zoomStep(element: ZoomTarget, delta: number,): number {
  return applyZoom(element, readZoom(element,) + delta,);
}

/**
 * Remember the factor a pinch starts from.
 *
 * The pinch scale is relative to the finger distance at gesture start, so the
 * zoom factor of that moment is the base the live scale multiplies.
 * @param element - Zoomed element.
 * @returns {void}
 */
export function beginPinchZoom(element: ZoomTarget,): void {
  pinchBase.set(element, readZoom(element,),);
}

/**
 * Apply a live pinch scale to the zoom factor.
 *
 * Every move of the same pinch uses the factor captured at gesture start, so
 * the zoom follows the fingers instead of compounding move after move.
 * @param element - Zoomed element.
 * @param scale - Finger distance relative to the gesture start.
 * @returns {number} The clamped factor that was applied.
 */
export function applyPinchZoom(element: ZoomTarget, scale: number,): number {
  const base = pinchBase.get(element,) ?? readZoom(element,);
  pinchBase.set(element, base,);
  return applyZoom(element, base * scale,);
}

/**
 * Forget the pinch bookkeeping - the gesture ended.
 * @param element - Zoomed element.
 * @returns {void}
 */
export function endPinchZoom(element: ZoomTarget,): void {
  pinchBase.delete(element,);
}

/**
 * True when the focused element takes text input.
 * @param element - Focused element (may be null).
 * @returns {boolean}
 */
function isTextField(element: Element | null | undefined,): boolean {
  if (!element) { return false; }
  const tag = element.tagName?.toUpperCase?.() ?? "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { return true; }
  return (element as HTMLElement).isContentEditable === true;
}

/**
 * Bind the keyboard zoom shortcuts.
 *
 * Ctrl+= / Ctrl+- / Ctrl+0 always work; the bare keys only work when no text
 * field has focus, so typing in the composer is never hijacked.
 * @param scope - Element the listener is bound to (the window).
 * @param element - Zoomed element.
 * @returns {() => void} Cleanup that removes the listener again.
 */
export function bindZoomKeys(scope: ZoomKeyScope, element: ZoomTarget,): () => void {
  const onKeyDown = (event: ZoomKeyEvent,): void => {
    const modifier = event.ctrlKey === true || event.metaKey === true;
    if (!modifier && isTextField(scope.activeElement,)) { return; }
    if (event.key === "=" || event.key === "+") {
      event.preventDefault?.();
      zoomStep(element, ZOOM_STEP,);
      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault?.();
      zoomStep(element, -ZOOM_STEP,);
      return;
    }

    if (event.key === "0") {
      event.preventDefault?.();
      resetZoom(element,);
    }
  };

  scope.addEventListener("keydown", onKeyDown,);
  return () => scope.removeEventListener("keydown", onKeyDown,);
}
