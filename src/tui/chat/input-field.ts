// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * pi-tui `Input` subclass with a change hook.
 *
 * The completion strip must re-filter as the user types; pi-tui's `Input`
 * has `onSubmit`/`onEscape` but no change callback, so the hook is added by
 * overriding `handleInput` — the single path through which edits flow.
 */

import { PiInput, } from "../pi";

/** */
export class ChatInputField extends PiInput {
  /** Called after any keystroke the field applied. */
  onChange?: () => void;

  /**
   * @param data - raw key data
   * @returns whether the field consumed the key
   */
  override handleInput(data: string,): boolean {
    const handled = super.handleInput(data,);
    if (handled) { this.onChange?.(); }
    return handled;
  }
}
