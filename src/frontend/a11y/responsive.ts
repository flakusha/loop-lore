// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Input-Mode Detection (TASK-responsive-design).
 *
 * Tracks touch vs. mouse on hybrid devices and mirrors the pointer/motion
 * media queries CSS already keys on into a snapshot plus optional
 * `touch-user` / `mouse-user` classes. CSS stays the primary mechanism
 * (coarse-pointer 44px targets in app.css); use this where JS needs the
 * same signal. All media/event access degrades cleanly outside browsers.
 */

/** Pointer kinds reported by PointerEvent.pointerType. */
export type PointerKind = "mouse" | "touch" | "pen";

/** Immutable view of the tracked input-mode signals. */
export interface InputModeSnapshot {
  /** Last observed pointer kind; null until a pointerdown fires. */
  pointer: PointerKind | null;
  /** Primary input supports hover, per "(hover: hover) and (pointer: fine)". */
  hoverCapable: boolean;
  /** User prefers reduced motion, per "(prefers-reduced-motion: reduce)". */
  reducedMotion: boolean;
}

/** Minimal classList surface (real: Element; tests: fake). */
export interface ClassToggleTarget {
  classList: {
    toggle(token: string, force?: boolean,): void;
    remove(...tokens: string[]): void;
  };
}

/** Minimal pointerdown source (real: window; tests: fake). */
export interface PointerEventSource {
  addEventListener(type: "pointerdown", listener: (event: Event,) => void, options?: AddEventListenerOptions,): void;
  removeEventListener(type: "pointerdown", listener: (event: Event,) => void, options?: AddEventListenerOptions,): void;
}

/** */
export interface InputModeTrackerOptions {
  /** Receives the touch-user/mouse-user classes; default document.body when present. */
  target?: ClassToggleTarget;
  /** pointerdown source; default window when present. */
  events?: PointerEventSource;
  /** Invoked whenever a tracked signal changes after creation. */
  onChange?: (snapshot: InputModeSnapshot,) => void;
}

/** Same query as alpine/info-bubble.ts so JS and CSS agree on hover. */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const NOOP = (): void => undefined;

/** Current state of a media query; false when matchMedia is missing or throws. */
function queryMatches(query: string,): boolean {
  try {
    return globalThis.matchMedia?.(query,)?.matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Subscribe to a media query. Degrades to a no-op when matchMedia
 * is missing or throws; callers read the initial state themselves.
 */
function observeQuery(query: string, apply: (matches: boolean,) => void,): () => void {
  let media: MediaQueryList | undefined;
  try {
    media = globalThis.matchMedia?.(query,);
  } catch {
    return NOOP;
  }

  if (!media) { return NOOP; }
  const onChange = (event: MediaQueryListEvent,): void => apply(event.matches,);
  media.addEventListener("change", onChange,);
  return () => media.removeEventListener("change", onChange,);
}

/** document.body when a DOM is present; undefined in non-browser runtimes. */
function resolveDefaultTarget(): ClassToggleTarget | undefined {
  return typeof document === "object" ? document.body : undefined;
}

/** window when present; undefined in non-browser runtimes. */
function resolveDefaultEvents(): PointerEventSource | undefined {
  return typeof window === "object" ? window : undefined;
}

/**
 * Create an input-mode tracker. Pure factory — no module state; call
 * stop() to detach every listener and clear the tracked classes.
 */
export function createInputModeTracker(options: InputModeTrackerOptions = {},) {
  const target = options.target ?? resolveDefaultTarget();
  const events = options.events ?? resolveDefaultEvents();
  const snapshot: InputModeSnapshot = {
    pointer: null,
    hoverCapable: queryMatches(HOVER_QUERY,),
    reducedMotion: queryMatches(REDUCED_MOTION_QUERY,),
  };

  const emit = (): void => options.onChange?.({ ...snapshot, },);

  const syncClasses = (): void => {
    if (!target) { return; }
    const isTouch = snapshot.pointer === "touch" || snapshot.pointer === "pen";
    target.classList.toggle("touch-user", isTouch,);
    target.classList.toggle("mouse-user", snapshot.pointer === "mouse",);
  };

  const disposers = [
    observeQuery(HOVER_QUERY, (matches,) => {
      snapshot.hoverCapable = matches;
      emit();
    },),
    observeQuery(REDUCED_MOTION_QUERY, (matches,) => {
      snapshot.reducedMotion = matches;
      emit();
    },),
  ];

  const onPointerDown = (event: Event,): void => {
    const pointerType = (event as PointerEvent).pointerType;
    if (pointerType !== "mouse" && pointerType !== "touch" && pointerType !== "pen") { return; }
    snapshot.pointer = pointerType;
    syncClasses();
    emit();
  };

  events?.addEventListener("pointerdown", onPointerDown, { passive: true, },);

  return {
    /** Current snapshot (defensive copy). */
    current: (): InputModeSnapshot => ({ ...snapshot, }),
    /** Detach listeners and clear the touch-user/mouse-user classes. */
    stop: (): void => {
      events?.removeEventListener("pointerdown", onPointerDown, { passive: true, },);
      disposers.forEach((dispose,) => dispose());
      target?.classList.remove("touch-user", "mouse-user",);
    },
  };
}
