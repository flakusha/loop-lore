/**
 * Typewriter Text Effect
 *
 * Character-by-character text reveal for VN mode dialogue.
 * Respects prefers-reduced-motion.
 */

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
  return window.matchMedia("(prefers-reduced-motion: reduce)",).matches;
}

/**
 * Animate text character-by-character into a container.
 * Returns a promise that resolves when complete or on skip.
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
 */
export function isTypewriting(): boolean {
  return activeAnimation !== null;
}
