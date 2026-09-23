// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Text Effects (TASK-025)
 *
 * Pure-DOM helper that drives the shake / glow / typewriter / fade
 * effects. CSS owns the keyframe animations (the fx-* classes live in
 * src/public/css/app.css); this module owns the lifecycle and the
 * reduced-motion detector that mirrors the existing
 * src/frontend/vn/typewriter.ts pattern.
 *
 * applyFx(element, name, opts) returns a stop() callback. The
 * non-typewriter effects just toggle a CSS class; the typewriter
 * variant drives requestAnimationFrame / setTimeout itself and is
 * the one piece that NEEDS to live in JS (CSS cannot reveal text
 * char-by-char). Each call is an independent run: concurrent effects
 * never cancel each other — call the returned stop() to end one.
 */

export type FxName = "shake" | "glow" | "typewriter" | "fade";

export interface FxOptions {
  /** Typewriter speed in ms per character. Ignored for non-typewriter effects. */
  speed?: number;
  /** Override text (typewriter only). Defaults to element.textContent. */
  text?: string;
}

/** Handle returned by requestAnimationFrame under the DOM lib. */
type RafHandle = number;
/** Handle returned by setTimeout under the DOM lib. */
type TimerHandle = number;

const FX_CLASSES: Record<FxName, string> = {
  shake: "fx-shake",
  glow: "fx-glow",
  typewriter: "fx-typewriter",
  fade: "fx-fade",
};

/** Count of in-flight typewriter runs (decorative effects are synchronous). */
let activeRuns = 0;

/**
 * Mirrors the helper used by src/frontend/vn/typewriter.ts so the
 * behaviour is consistent across the codebase.
 */
export function prefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia("(prefers-reduced-motion: reduce)",).matches;
  } catch {
    return false;
  }
}

/**
 * Apply a text effect to an element. Returns a stop() callback
 * that removes the class and cancels any pending animation.
 *
 * @param el
 * @param name
 * @param opts
 */
export function applyFx(
  el: HTMLElement,
  name: FxName,
  opts: FxOptions = {},
): () => void {
  const cls = FX_CLASSES[name];
  if (!cls) {
    // Unknown fx name — nothing to apply or clean up.
    return () => {/* no-op */};
  }

  // Remove any prior fx-* class so a re-application re-triggers the
  // keyframe (the browser caches animation state otherwise).
  for (const c of Object.values(FX_CLASSES,)) {
    if (el.classList.contains(c,)) { el.classList.remove(c,); }
  }

  if (name === "typewriter") { return runTypewriter(el, opts,); }

  // Decorative effects (shake/glow/fade) honor reduced-motion by
  // applying the END state only — a one-frame flash is not useful.
  el.classList.add(cls,);
  return () => el.classList.remove(cls,);
}

function runTypewriter(el: HTMLElement, opts: FxOptions,): () => void {
  const text = opts.text ?? el.textContent ?? "";
  const speed = Math.max(1, opts.speed ?? 30,);
  el.classList.add(FX_CLASSES.typewriter,);

  // Reduced motion skips straight to the END state — the text is
  // never blanked (no flash of missing content) and nothing is
  // scheduled, so no run is registered.
  if (prefersReducedMotion()) {
    return () => el.classList.remove(FX_CLASSES.typewriter,);
  }

  let index = 0;
  let raf: RafHandle | null = null;
  let timer: TimerHandle | null = null;
  let ended = false;

  const revealNext = (): void => {
    if (ended) { return; }
    if (index >= text.length) {
      raf = null;
      ended = true;
      activeRuns--;
      return;
    }
    index++;
    // Write the prefix in one assignment: `textContent +=` reads the
    // DOM string back on every character (O(n²) over a full reveal).
    el.textContent = text.slice(0, index,);
    timer = window.setTimeout(() => {
      timer = null;
      raf = requestAnimationFrame(revealNext,);
    }, speed,);
  };

  activeRuns++;
  raf = requestAnimationFrame(revealNext,);

  return () => {
    if (raf !== null) {
      cancelAnimationFrame(raf,);
      raf = null;
    }
    if (timer !== null) {
      clearTimeout(timer,);
      timer = null;
    }
    if (!ended) {
      ended = true;
      activeRuns--;
    }
    el.classList.remove(FX_CLASSES.typewriter,);
    // Stopping reveals the full text — the skip-to-end contract.
    el.textContent = text;
  };
}

/**
 * True while any fx-driven animation is in flight.
 */
export function isFxActive(): boolean {
  return activeRuns > 0;
}
