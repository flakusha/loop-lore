/**
 * Focus Management
 *
 * Utilities for keyboard navigation and focus management.
 * Provides WCAG 2.1 compliant focus handling for interactive elements.
 */

/**
 * Get the first focusable element within a container.
 * Supports tab, shift+tab, arrow keys, and enter/space activation.
 */
export function getFirstFocusable(container: Element,): HTMLElement | null {
  const focusables = container.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"]',
  );
  return focusables[0] ?? null;
}

/**
 * Get the last focusable element within a container.
 */
export function getLastFocusable(container: Element,): HTMLElement | null {
  const focusables = container.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"]',
  );
  return focusables[focusables.length - 1] ?? null;
}

/**
 * Trap focus within a container (for modals, dialogs).
 * Returns a cleanup function to remove event listeners.
 */
export function trapFocus(container: Element,): () => void {
  const first = getFirstFocusable(container,);
  const last = getLastFocusable(container,);

  if (!first && !last) {
    // No focusable elements — return a no-op cleanup.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return () => {};
  }

  const handleKeyDown = (e: KeyboardEvent,) => {
    if (e.key !== "Tab") { return; }

    const target = e.target as HTMLElement;
    if (!container.contains(target,)) { return; }

    if (e.shiftKey) {
      // Shift + Tab: move backward
      if (target === first) {
        e.preventDefault();
        last?.focus();
      }
    } else {
      // Tab: move forward
      if (target === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  container.addEventListener("keydown", handleKeyDown as EventListener,);

  return () => {
    container.removeEventListener("keydown", handleKeyDown as EventListener,);
  };
}

/**
 * Focus the first element that matches a selector.
 * Useful for focusing the message input or search field.
 */
export function focusFirst(selector: string,): void {
  const element = document.querySelector<HTMLElement>(selector,);
  if (element && typeof element.focus === "function") {
    element.focus();
  }
}

/**
 * Focus the skip-to-content link for keyboard users.
 * Skips to the main content area.
 */
export function focusSkipToContent(): void {
  const skipLink = document.querySelector<HTMLAnchorElement>(".skip-to-content",);
  if (skipLink) {
    skipLink.focus();
  }
}

/**
 * Focus the main content area.
 * Used after page transitions or modal closes.
 */
export function focusMainContent(): void {
  const main = document.querySelector<HTMLElement>('[role="main"], #app-root',);
  if (main) {
    main.setAttribute("tabindex", "-1",);
    (main as HTMLElement).focus();
  }
}

/**
 * Set focus to an element by ID.
 */
export function focusById(id: string,): void {
  const element = document.querySelector<HTMLElement>(`#${id}`,);
  element?.focus();
}

/**
 * Ensure focus is visible for keyboard navigation.
 * Removes outline-none classes and adds focus-visible styles.
 */
export function ensureVisibleFocus(element: HTMLElement,): void {
  element.classList.remove("focus-hidden",);
  element.classList.add("focus-visible",);
}

/**
 * Check if an element is currently visible in the viewport.
 */
export function isInViewport(element: Element,): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Scroll an element into view and focus it.
 */
export function focusIntoView(element: HTMLElement, offset = 0,): void {
  element.scrollIntoView({ block: "center", inline: "center", },);
  if (offset !== 0) {
    window.scrollBy(0, offset,);
  }
  if (isInViewport(element,)) {
    element.focus();
  }
}

/**
 * Create a portal for moving focus between windows/iframes.
 * Stores the previously focused element and restores it on close.
 */
export class FocusPortal {
  private previousActiveElement: HTMLElement | null = null;

  enter(container: Element,): void {
    this.previousActiveElement = document.activeElement as HTMLElement | null;
    const first = getFirstFocusable(container,);
    if (first) {
      first.focus();
    }
  }

  exit(): void {
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
    this.previousActiveElement = null;
  }
}

// Global keyboard navigation helpers
let escapeKeyHandler: (() => void) | null = null;

/**
 * Register an escape key handler for closing modals/sidebars.
 * Returns a function to unregister the handler.
 */
export function onEscapeKey(handler: () => void,): () => void {
  escapeKeyHandler = handler;
  return () => {
    if (escapeKeyHandler === handler) {
      escapeKeyHandler = null;
    }
  };
}

/**
 * Handle escape key for keyboard navigation.
 * Closes sidebar if open, or calls registered escape handler.
 */
export function handleEscapeKey(): void {
  const sidebar = document.querySelector("#layout-sidebar",);
  if (sidebar?.classList.contains("open",)) {
    globalThis.closeSidebar?.();
    return;
  }

  if (escapeKeyHandler) {
    escapeKeyHandler();
  }
}

// Auto-register escape key listener if not already done
if (typeof window !== "undefined" && !((globalThis as any).__escapeKeyListenerRegistered)) {
  (globalThis as any).__escapeKeyListenerRegistered = true;
  document.addEventListener("keydown", (e: KeyboardEvent,) => {
    if (e.key === "Escape") {
      handleEscapeKey();
    }
  },);
}
