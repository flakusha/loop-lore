/**
 * Scene Transition Engine
 *
 * Handles visual transitions between VN scenes.
 * Supports fade, cut, dissolve, slide, wipe.
 */

export type TransitionType = "fade" | "cut" | "dissolve" | "slide" | "wipe";

export interface TransitionOptions {
  type: TransitionType;
  duration?: number;
}

const DEFAULT_DURATION: Record<TransitionType, number> = {
  fade: 400,
  cut: 0,
  dissolve: 600,
  slide: 300,
  wipe: 400,
};

/**
 * Check if user prefers reduced motion.
 */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)",).matches;
}

/**
 * Transition between two scene containers.
 * The outgoing element fades/slides out while incoming fades/slides in.
 *
 * @param outgoing - Current scene element (will be hidden)
 * @param incoming - New scene element (will be shown)
 * @param options - Transition type and duration
 * @returns Promise that resolves when transition completes
 */
export function transitionScene(
  outgoing: HTMLElement | null,
  incoming: HTMLElement,
  options: TransitionOptions,
): Promise<void> {
  const { type, } = options;
  const duration = options.duration ?? DEFAULT_DURATION[type];

  // Cut or reduced motion → instant swap
  if (type === "cut" || duration === 0 || prefersReducedMotion()) {
    if (outgoing) {
      outgoing.style.display = "none";
    }
    incoming.style.display = "";
    incoming.style.opacity = "1";
    incoming.style.transform = "";
    return Promise.resolve();
  }

  return new Promise((resolve,) => {
    incoming.style.display = "";
    incoming.style.opacity = "0";

    switch (type) {
      case "fade": {
        if (outgoing) {
          outgoing.style.transition = `opacity ${duration}ms ease`;
          outgoing.style.opacity = "0";
        }
        incoming.style.transition = `opacity ${duration}ms ease`;
        incoming.style.opacity = "1";
        break;
      }
      case "slide": {
        if (outgoing) {
          outgoing.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
          outgoing.style.transform = "translateX(-100%)";
          outgoing.style.opacity = "0";
        }
        incoming.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
        incoming.style.transform = "translateX(0)";
        incoming.style.opacity = "1";
        break;
      }
      case "wipe": {
        incoming.style.clipPath = "inset(0 100% 0 0)";
        incoming.style.transition = `clip-path ${duration}ms ease`;
        // Force reflow — reading offsetHeight forces a synchronous layout pass.
        // eslint-disable-next-line sonarjs/void-use -- the read itself is the side effect
        void incoming.offsetHeight;
        incoming.style.clipPath = "inset(0 0 0 0)";
        incoming.style.opacity = "1";
        break;
      }
      case "dissolve": {
        // Simulated dissolve via opacity + filter
        incoming.style.filter = "blur(8px)";
        incoming.style.transition = `opacity ${duration}ms ease, filter ${duration}ms ease`;
        if (outgoing) {
          outgoing.style.transition = `opacity ${duration}ms ease, filter ${duration}ms ease`;
          outgoing.style.filter = "blur(8px)";
          outgoing.style.opacity = "0";
        }
        // Force reflow — reading offsetHeight forces a synchronous layout pass.
        // eslint-disable-next-line sonarjs/void-use -- the read itself is the side effect
        void incoming.offsetHeight;
        incoming.style.opacity = "1";
        incoming.style.filter = "blur(0)";
        break;
      }
    }

    const onEnd = (): void => {
      incoming.removeEventListener("transitionend", onEnd,);
      if (outgoing) {
        outgoing.style.display = "none";
        outgoing.style.transition = "";
        outgoing.style.transform = "";
        outgoing.style.filter = "";
      }
      incoming.style.transition = "";
      incoming.style.clipPath = "";
      incoming.style.filter = "";
      resolve();
    };

    incoming.addEventListener("transitionend", onEnd, { once: true, },);

    // Fallback timeout in case transitionend doesn't fire
    setTimeout(() => {
      onEnd();
    }, duration + 50,);
  },);
}
