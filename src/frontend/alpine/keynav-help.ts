// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyboard Navigation Help Overlay
 *
 * Lists all registered shortcuts from shortcuts.ts getKeymap().
 * Opened by the ? key (dispatches keynav:toggle-help) or
 * from the help button in the nav.
 */

import { getKeymap, } from "./shortcuts";

/**
 * Alpine component for the keynav help overlay.
 * Reads shortcuts from the keymap registry.
 */
export function keynavHelp() {
  return {
    open: false,
    shortcuts: getKeymap(),

    init() {
      // Listen for ? key dispatched by shortcuts.ts
      window.addEventListener("keynav:toggle-help", () => this.toggle(),);
      // Also open from any help button in templates
    },

    toggle() {
      this.open = !this.open;
      document.body.style.overflow = this.open ? "hidden" : "";
    },

    close() {
      if (!this.open) { return; }
      this.open = false;
      document.body.style.overflow = "";
    },

    /**
     * Translate an i18n key via the global t() helper.
     * Falls back to the action name if no translation exists.
     */
    label(key: string,): string {
      const fn = (globalThis as unknown as { t?: (k: string,) => string }).t;
      return fn ? fn(key,) : key;
    },
  };
}
