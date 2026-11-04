// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared touch gesture session - the arbitration layer between detectors.
 *
 * Every detector that listens on the same element joins ONE session: the
 * first touchstart handler to run owns the start point, and every later
 * handler measures against that same origin. The session carries a single
 * claim, so the detectors cooperate instead of each firing independently:
 * the first gesture to earn the claim keeps it, and a pinch outranks all.
 */

/** Which gesture owns the current touch interaction. */
export type GestureClaim = "none" | "horizontal" | "vertical" | "pinch";

/** Minimal touch shape the session needs (a real Touch satisfies it). */
export interface GestureTouch {
  /** Horizontal viewport coordinate (px). */
  clientX: number;
  /** Vertical viewport coordinate (px). */
  clientY: number;
}

/** Movement measured from the session's start point. */
export interface GestureMovement {
  /** Horizontal delta since the start point (px). */
  dx: number;
  /** Vertical delta since the start point (px). */
  dy: number;
  /** Travel (px) that counts as significant movement. */
  threshold: number;
}

/** Per-element state of the touch interaction in progress. */
export interface GestureSession {
  /** X of the interaction's start point (px, viewport coordinates). */
  startX: number;
  /** Y of the interaction's start point (px, viewport coordinates). */
  startY: number;
  /** True once the start point has been recorded for this interaction. */
  started: boolean;
  /** Which gesture owns the interaction. */
  claim: GestureClaim;
  /** True once the pointer travelled past the movement tolerance. */
  moved: boolean;
  /** True when the interaction started on selectable text (no gesture fires). */
  blocked: boolean;
}

/** Live sessions, one per element. */
const sessions = new WeakMap<Element, GestureSession>();

/** Minimal view of the platform selection API. */
export interface SelectionScope {
  /** The current selection (null when the platform has none). */
  getSelection?: () => { isCollapsed?: boolean; toString: () => string } | null;
}

/** The platform selection source (globalThis in the browser). */
function platformSelection(): SelectionScope {
  return globalThis as unknown as SelectionScope;
}

/**
 * True when the document holds a non-collapsed text selection.
 *
 * A gesture that starts on selectable text is a no-op: the user is picking
 * text, not driving the chat.
 * @param scope - Selection source; defaults to the platform.
 * @returns {boolean}
 */
export function hasTextSelection(scope: SelectionScope = platformSelection(),): boolean {
  const selection = scope.getSelection?.();
  if (!selection) { return false; }
  if (selection.isCollapsed === false) { return true; }
  return selection.toString().trim() !== "";
}

/** Options for starting (or joining) a gesture session. */
export interface BeginSessionOptions extends GestureTouch {
  /**
   * Selection source for the text-selection carve-out.
   *
   * Defaults to the platform. Callers that must not read a shared global
   * (tests) inject their own source instead.
   */
  selection?: SelectionScope;
}

/**
 * Start (or join) the gesture session of an element.
 *
 * The start point is recorded ONCE per interaction: the first touchstart
 * handler to run owns it, so every detector measures against the same
 * origin. A second finger joining the interaction keeps that origin too.
 * @param element - Element the touch landed on.
 * @param options - Touch that started (or joined) the interaction plus the
 * selection source used for the carve-out.
 * @returns {GestureSession} The session the caller must measure against.
 */
export function beginSession(element: Element, options: BeginSessionOptions,): GestureSession {
  const existing = sessions.get(element,);
  if (existing?.started) { return existing; }
  const session: GestureSession = {
    startX: options.clientX,
    startY: options.clientY,
    started: true,
    claim: "none",
    moved: false,
    blocked: hasTextSelection(options.selection,),
  };

  sessions.set(element, session,);
  return session;
}

/**
 * True when the interaction started on selectable text.
 *
 * Every detector asks this before it fires: a gesture over a text selection
 * is a no-op.
 * @param element - Element the interaction runs on.
 * @returns {boolean}
 */
export function isBlocked(element: Element,): boolean {
  return sessions.get(element,)?.blocked ?? false;
}

/**
 * Claim the interaction for an axis once the travel passes the threshold.
 *
 * The FIRST claim wins: a gesture already owned by a vertical pull cannot be
 * stolen by a later horizontal swipe, and vice versa.
 * @param element - Element the interaction runs on.
 * @param movement - Delta from the start point plus the travel threshold.
 * @returns {void}
 */
export function updateClaim(element: Element, movement: GestureMovement,): void {
  const session = sessions.get(element,);
  if (!session || session.claim !== "none") { return; }
  const { dx, dy, threshold, } = movement;
  if (Math.abs(dx,) < threshold && Math.abs(dy,) < threshold) { return; }
  session.claim = Math.abs(dx,) > Math.abs(dy,) ? "horizontal" : "vertical";
}

/**
 * Claim the interaction for a two-finger pinch.
 *
 * A pinch wins over every other claim - it is a deliberate two-pointer
 * gesture and must suppress the single-pointer swipe and pull detectors.
 * @param element - Element the interaction runs on.
 * @returns {void}
 */
export function claimPinch(element: Element,): void {
  const session = sessions.get(element,);
  if (!session) { return; }
  session.claim = "pinch";
}

/**
 * Record that the pointer travelled past the movement tolerance.
 * @param element - Element the interaction runs on.
 * @param movement - Delta from the start point plus the tolerance (px).
 * @returns {boolean} True when the movement is past the tolerance.
 */
export function markMoved(element: Element, movement: GestureMovement,): boolean {
  const session = sessions.get(element,);
  if (!session) { return false; }
  const { dx, dy, threshold, } = movement;
  if (Math.hypot(dx, dy,) < threshold) { return false; }
  session.moved = true;
  return true;
}

/**
 * The gesture that currently owns the interaction on an element.
 * @param element - Element the interaction runs on.
 * @returns {GestureClaim} The owning gesture, "none" when unclaimed.
 */
export function claimOf(element: Element,): GestureClaim {
  return sessions.get(element,)?.claim ?? "none";
}

/**
 * End the interaction on an element.
 *
 * The record is kept (not dropped) so a detector whose touchend handler runs
 * after the one that ended the interaction can still read the claim; the
 * next beginSession() starts a fresh record.
 * @param element - Element the interaction ran on.
 * @returns {void}
 */
export function clearSession(element: Element,): void {
  const session = sessions.get(element,);
  if (!session) { return; }
  session.started = false;
}
