// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import {
  getKeymap,
  isKeyboardNavEnabled,
  resetKeymapOverrides,
  setKeymapOverride,
  validateKeymapCombo,
} from "../shortcuts";
import type { SettingsState, } from "./types";

/**
 * Keyboard-shortcut editor section for the /settings page.
 * Lets the user rebind single-key and `g <key>` combos; overrides persist
 * to localStorage (`keynav.keymap`) and merge over DEFAULT_KEYMAP.
 * @returns Editor state plus rebind/reset methods bound by the host
 */
export function keynav(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    keynavEnabled: false,
    keymap: getKeymap(),
    rebindingAction: "",
    rebindAwaitSecond: false,
    keynavError: "",

    /**
     * Refresh the section from the effective keymap. Called when the tab opens.
     * @returns {void}
     */
    loadKeymapSection() {
      this.keynavEnabled = isKeyboardNavEnabled();
      this.keymap = getKeymap();
      this.cancelRebind();
    },

    /**
     * Begin capturing the next key(s) for the given action.
     * @param action - Action id to rebind
     * @returns {void}
     */
    startRebind(action: string,) {
      this.rebindingAction = action;
      this.rebindAwaitSecond = false;
      this.keynavError = "";
    },

    /**
     * @returns {void}
     */
    cancelRebind() {
      this.rebindingAction = "";
      this.rebindAwaitSecond = false;
      this.keynavError = "";
    },

    /**
     * Capture-mode keydown handler. Inert unless a rebind is in progress;
     * builds a single-key or `g <key>` combo from the raw events.
     * @param e - The DOM keydown event
     * @returns {void}
     */
    handleRebindKeydown(e: KeyboardEvent,) {
      if (!this.rebindingAction) { return; }
      e.preventDefault();
      // Keep the capture exclusive: the document-level keynav listener must
      // not see these keys (? would pop the help overlay, g arms a sequence).
      e.stopPropagation();
      if (e.key === "Escape") {
        this.cancelRebind();
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) {
        this.keynavError = "frontend.keynav.editor.invalid";
        return;
      }

      if (!this.rebindAwaitSecond && e.key === "g") {
        this.rebindAwaitSecond = true;
        return;
      }

      const combo = this.rebindAwaitSecond ? `g ${e.key}` : e.key;
      this.rebindAwaitSecond = false;
      const verdict = validateKeymapCombo(combo, this.rebindingAction, getKeymap(),);
      if (!verdict.ok) {
        this.keynavError = `frontend.keynav.editor.${verdict.reason}`;
        return;
      }

      setKeymapOverride(this.rebindingAction, combo,);
      this.keymap = getKeymap();
      this.cancelRebind();
    },

    /**
     * Clear all stored overrides and restore the default keymap.
     * @returns {void}
     */
    resetKeymapToDefaults() {
      resetKeymapOverrides();
      this.keymap = getKeymap();
      this.cancelRebind();
    },

    /**
     * Translate an action id, falling back to the raw id.
     * @param action - Action id from the keymap
     * @returns The translated label, or the raw action id
     */
    actionLabel(action: string,) {
      const i18nKey = `frontend.keynav.actions.${action}`;
      const translated = t(i18nKey,);
      return translated === i18nKey ? action : translated;
    },
  };
}
