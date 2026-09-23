// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Text Effects (TASK-025)
 *
 * Pure-DOM helper that drives the shake / glow / typewriter / fade
 * effects exposed by src/components/text-fx.html. CSS owns the
 * keyframe animations; this module owns the lifecycle and the
 * reduced-motion detector that mirrors the existing
 * src/frontend/vn/typewriter.ts pattern.
 *
 * applyFx(element, name, opts) returns a stop() callback. The
 * non-typewriter effects just toggle a CSS class; the typewriter
 * variant drives requestAnimationFrame / setTimeout itself and is
 * the one piece that NEEDS to live in JS (CSS cannot reveal text
 * char-by-char).
 */

export type FxName = "shake" | "glow" | "typewriter" | "fade";

export interface FxOptions {
  /** Typewriter speed in ms per character. Ignored for non-typewriter effects. */
  speed?: number;
  /** Override text (typewriter only). Defaults to element.textContent. */
  text?: string;
}

const FX_CLASSES: Record<FxName, string> = {
  shake: "fx-shake",
  glow: "fx-glow",
  typewriter: "fx-typewriter",
  fade: "fx-fade",
};

let activeRaf: ReturnType<typeof requestAnimationFrame> | null = null;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;

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

function cancelActive(): void {
  if (activeRaf !== null) { cancelAnimationFrame(activeRaf,); activeRaf = null; }
  if (activeTimeout !== null) { clearTimeout(activeTimeout,); activeTimeout = null; }
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
  cancelActive();
  const cls = FX_CLASSES[name];
  if (!cls) { return () => {}; }

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
  el.textContent = "";

  if (prefersReducedMotion()) {
    el.textContent = text;
    return () => el.classList.remove(FX_CLASSES.typewriter,);
  }

  let index = 0;
  let cancelled = false;

  const revealNext = (): void => {
    if (cancelled) { return; }
    if (index >= text.length) {
      activeRaf = null;
      activeTimeout = null;
      return;
    }
    el.textContent += text[index]!;
    index++;
    activeTimeout = setTimeout(() => {
      activeRaf = requestAnimationFrame(revealNext,);
    }, speed,);
  };

  activeRaf = requestAnimationFrame(revealNext,);

  return () => {
    cancelled = true;
    cancelActive();
    el.classList.remove(FX_CLASSES.typewriter,);
    el.textContent = text;
  };
}

/**
 * True while any fx-driven animation is in flight.
 */
export function isFxActive(): boolean {
  return activeRaf !== null || activeTimeout !== null;
}
