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

import { getKeymap, isKeyboardNavEnabled, type ShortcutEntry, } from "./shortcuts";

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

/** Read the client-side translation helper registered by the i18n bundle. */
function globalT(): ((key: string,) => string) | undefined {
  const g: { t?: (k: string,) => string } = globalThis;
  return g.t;
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
      this.open = !this.open;
      if (this.open) { this.shortcuts = getKeymap(); }
      document.body.style.overflow = this.open ? "hidden" : "";
    },

    /**
     * @returns {void}
     */
    close() {
      if (!this.open) { return; }
      this.open = false;
      document.body.style.overflow = "";
    },

    /**
     * Translate an action id via the global t() helper.
     * Falls back to the action name if no translation exists.
     * @param key - Action id from the keymap
     * @returns The translated label, or the raw action id
     */
    label(key: string,): string {
      const i18nKey = `frontend.keynav.actions.${key}`;
      const fn = globalT();
      const translated = fn?.(i18nKey,);
      return translated && translated !== i18nKey ? translated : key;
    },
  };
}

globalThis.keynavHelp = keynavHelp;
