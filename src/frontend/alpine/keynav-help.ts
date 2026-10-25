// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyboard Navigation Help Overlay
 *
 * Lists all registered shortcuts from shortcuts.ts getKeymap().
 * Opened by the ? key (dispatches keynav:toggle-help) or
 * from the help button in the layout sidebar footer (opt-in via the
 * `keynav` localStorage flag).
 */

import { t, } from "./i18n";
import { getKeymap, isKeyboardNavEnabled, type ShortcutEntry, } from "./shortcuts";

/** Selector for the overlay element rendered in layout.html. */
const OVERLAY_SELECTOR = '[data-testid="keynav-help-overlay"]';

/** Selector for the elements that can hold keyboard focus. */
const FOCUSABLE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Releases the focus trap of the open overlay (null while the overlay is closed). */
let releaseFocusTrap: (() => void) | null = null;

/**
 * Trap keyboard focus inside the help overlay.
 *
 * Alpine reveals the overlay with x-show one animation frame after `open`
 * flips, so focus is moved in as soon as the overlay accepts it and retried
 * on the following frames. Tab and Shift+Tab only ever reach the overlay's
 * focusable elements.
 *
 * @param overlay - The overlay element
 * @returns A release function that removes the trap and restores the focus
 */
function trapOverlayFocus(overlay: HTMLElement,): () => void {
  const previous = document.activeElement as HTMLElement | null;

  const focusables = (): HTMLElement[] => Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR,),);

  const onKeyDown = (event: KeyboardEvent,): void => {
    if (event.key !== "Tab") { return; }
    const items = focusables();
    if (items.length === 0) {
      event.preventDefault();
      return;
    }

    const current = items.indexOf(document.activeElement as HTMLElement,);
    const next = event.shiftKey
      ? (current <= 0 ? items.length - 1 : current - 1)
      : (current < 0 || current === items.length - 1 ? 0 : current + 1);

    event.preventDefault();
    items[next]?.focus();
  };

  document.addEventListener("keydown", onKeyDown as EventListener, true,);

  // Move focus into the overlay once it is visible (x-show reveals it a frame later).
  let attempts = 10;
  const pullFocusIn = (): void => {
    const [first,] = focusables();
    first?.focus();
    if (overlay.contains(document.activeElement,) || attempts-- <= 0) { return; }
    globalThis.requestAnimationFrame(pullFocusIn,);
  };

  pullFocusIn();

  return () => {
    document.removeEventListener("keydown", onKeyDown as EventListener, true,);
    previous?.focus();
  };
}

/** State exposed to the Alpine template in layout.html. */
export interface KeynavHelpState {
  open: boolean;
  /** Whether the opt-in `keynav` flag is set; gates the help button. */
  navEnabled: boolean;
  shortcuts: ShortcutEntry[];
  init(): void;
  toggle(): void;
  close(): void;
  label(key: string,): string;
}

/**
 * Alpine component for the keynav help overlay.
 * Reads shortcuts from the keymap registry (re-read on every open so
 * rebound combos show up without a reload).
 * @returns The Alpine x-data state
 */
export function keynavHelp(): KeynavHelpState {
  return {
    open: false,
    navEnabled: isKeyboardNavEnabled(),
    shortcuts: getKeymap(),

    /**
     * @returns {void}
     */
    init() {
      // Listen for ? key dispatched by shortcuts.ts
      window.addEventListener("keynav:toggle-help", () => this.toggle(),);
    },

    /**
     * @returns {void}
     */
    toggle() {
      if (!this.navEnabled) { return; }
      if (this.open) {
        this.close();
        return;
      }

      this.open = true;
      this.shortcuts = getKeymap();
      document.body.style.overflow = "hidden";
      const overlay = document.querySelector<HTMLElement>(OVERLAY_SELECTOR,);
      if (overlay) { releaseFocusTrap = trapOverlayFocus(overlay,); }
    },

    /**
     * @returns {void}
     */
    close() {
      if (!this.open) { return; }
      this.open = false;
      document.body.style.overflow = "";
      releaseFocusTrap?.();
      releaseFocusTrap = null;
    },

    /**
     * Translate an action id via the global t() helper.
     * Falls back to the action name if no translation exists.
     * @param key - Action id from the keymap
     * @returns The translated label, or the raw action id
     */
    label(key: string,): string {
      const i18nKey = `frontend.keynav.actions.${key}`;
      const translated = t(i18nKey,);
      return translated === i18nKey ? key : translated;
    },
  };
}

globalThis.keynavHelp = keynavHelp;
