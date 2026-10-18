// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Typewriter Text Effect
 *
 * Character-by-character text reveal for VN mode dialogue.
 * Respects prefers-reduced-motion.
 */
import type { VnScene, } from "./scene-renderer/types";
import { resolveAnyTemplate, } from "./templates/apply";
import { getDialogueTemplate, } from "./templates/scene-templates";

/** */
export interface TypewriterOptions {
  speed: number;
  pausePunctuation: boolean;
  onChar?: (char: string, index: number,) => void;
  onComplete?: () => void;
}

const PUNCTUATION_PAUSES: Record<string, number> = {
  ",": 100,
  ".": 200,
  "!": 200,
  "?": 200,
  ";": 100,
  ":": 100,
};

let activeAnimation: ReturnType<typeof requestAnimationFrame> | null = null;
let activeResolve: (() => void) | null = null;

/**
 * Check if user prefers reduced motion.
 */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)",).matches;
}

/**
 * Animate text character-by-character into a container.
 * Returns a promise that resolves when complete or on skip.
 * @param container
 * @param text
 * @param options
 * @returns {Promise<void>}
 */
export function typewrite(
  container: HTMLElement,
  text: string,
  options: TypewriterOptions,
): Promise<void> {
  // Skip animation for reduced motion
  if (prefersReducedMotion()) {
    container.textContent = text;
    options.onComplete?.();
    return Promise.resolve();
  }

  return new Promise((resolve,) => {
    activeResolve = resolve;
    container.textContent = "";
    let index = 0;

    const revealNext = (): void => {
      if (index >= text.length) {
        activeAnimation = null;
        activeResolve = null;
        options.onComplete?.();
        resolve();
        return;
      }

      const char = text[index]!;
      container.textContent += char;
      options.onChar?.(char, index,);
      index++;

      let delay = options.speed;
      if (options.pausePunctuation && PUNCTUATION_PAUSES[char]) {
        delay += PUNCTUATION_PAUSES[char]!;
      }

      activeAnimation = requestAnimationFrame(() => {
        setTimeout(revealNext, delay,);
      },);
    };

    revealNext();
  },);
}

/**
 * Skip to end — instantly reveal all text.
 * @param container
 * @param fullText
 * @returns {void}
 */
export function skipTypewrite(container: HTMLElement, fullText: string,): void {
  if (activeAnimation !== null) {
    cancelAnimationFrame(activeAnimation,);
    activeAnimation = null;
  }

  container.textContent = fullText;
  activeResolve?.();
  activeResolve = null;
}

/**
 * Check if a typewriter animation is currently running.
 * @returns {boolean}
 */
export function isTypewriting(): boolean {
  return activeAnimation !== null;
}

/**
 * Resolve dialogue-template pacing for a scene onto typewriter options.
 *
 * Resolution: the scene's template id through all registries (built-in
 * scene, built-in dialogue, then the world's custom store). A
 * dialogue-category template contributes its `body.text` directly; a
 * scene-category template contributes its own `body.text`, falling back to
 * the dialogue style it points at (`body.dialogueStyle`). Only finite positive
 * `typewriterSpeed` and boolean `pauseOnPunctuation` map — everything else
 * (unknown template, missing text block, composite template) fails closed
 * to `base`.
 *
 * @param base Typewriter options to fall back to.
 * @param scene Scene carrying the optional templateId.
 * @param worldId World scope for custom-template lookup; optional.
 * @returns Pacing options — `base` itself when no template contributes.
 */
export function resolveDialoguePacing(
  base: TypewriterOptions,
  scene: VnScene,
  worldId?: string | null,
): TypewriterOptions {
  const template = resolveAnyTemplate(scene.templateId ?? "", worldId,);
  if (!template) { return base; }

  const text = template.category === "dialogue"
    ? template.body.text
    : template.category === "scene"
    // Scene bodies carry their own text block; dialogueStyle names a style
    // ("standard"…), not a dialogue template id, so it is only a fallback
    // for text-less scene bodies whose style happens to match an id.
    ? (template.body.text ?? getDialogueTemplate(template.body.dialogueStyle ?? "",)?.body.text)
    : undefined;

  if (!text) { return base; }

  const speed = typeof text.typewriterSpeed === "number" && Number.isFinite(text.typewriterSpeed,) &&
      text.typewriterSpeed > 0
    ? text.typewriterSpeed
    : base.speed;

  const pausePunctuation = typeof text.pauseOnPunctuation === "boolean"
    ? text.pauseOnPunctuation
    : base.pausePunctuation;

  return speed === base.speed && pausePunctuation === base.pausePunctuation
    ? base
    : { ...base, speed, pausePunctuation, };
}
