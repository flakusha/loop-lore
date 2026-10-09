// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Click-to-insert emoji picker slice (shares the shortcode registry).
 *
 * Split from ./emoji-autocomplete.ts to stay under the 250-line size gate.
 * Merged with `emojiAutocomplete` + `slashAutocomplete` in
 * `chat/bootstrap.ts`, so the composer sees one combined state object.
 */

import type { EmojiCandidate, } from "./emoji-autocomplete";
import { filterEmojiCandidates, } from "./emoji-autocomplete";
import type { ChatState, } from "./types";

export const emojiPicker: Partial<ChatState> & ThisType<ChatState> = {
  _emojiPickerOpen: false,
  _emojiPickerQuery: "",
  _emojiPickerResults: [] as EmojiCandidate[],
  _emojiPickerActiveIndex: 0,

  /**
   * Toggle the click-to-insert emoji picker (shares the shortcode registry).
   * @returns {void}
   */
  toggleEmojiPicker() {
    if (this._emojiPickerOpen) {
      this.closeEmojiPicker();

      return;
    }

    this._emojiPickerOpen = true;
    this._emojiPickerQuery = "";
    this._emojiPickerResults = filterEmojiCandidates("",);
    this._emojiPickerActiveIndex = 0;
  },

  /**
   * @returns {void}
   */
  closeEmojiPicker() {
    this._emojiPickerOpen = false;
    this._emojiPickerQuery = "";
    this._emojiPickerResults = [];
    this._emojiPickerActiveIndex = 0;
  },

  /**
   * Refine the picker grid from the search box (runs on next tick via x-model).
   * @returns {void}
   */
  filterEmojiPicker() {
    this._emojiPickerResults = filterEmojiCandidates((this._emojiPickerQuery ?? "").toLowerCase(),);
    this._emojiPickerActiveIndex = 0;
  },

  /**
   * Insert a shortcode at the composer cursor without clobbering text.
   * @param {EmojiCandidate} candidate
   * @returns {void}
   */
  insertEmoji(candidate: EmojiCandidate,) {
    const textarea = this.$refs?.messageInput as HTMLTextAreaElement | undefined;

    if (!textarea) { return; }
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const token = `:${candidate.name}: `;

    textarea.value = textarea.value.slice(0, start,) + token + textarea.value.slice(end,);
    const caret = start + token.length;

    textarea.selectionStart = textarea.selectionEnd = caret;
    textarea.focus();
    this.closeEmojiPicker();
  },

  /**
   * Keyboard-grid entry: Enter inserts the active result (Escape closes).
   * @param {number} index
   * @returns {void}
   */
  insertEmojiAtIndex(index: number,) {
    if (this._emojiPickerResults.length === 0) { this.filterEmojiPicker(); }
    const entry = this._emojiPickerResults[index];

    if (!entry) { return; }
    this.insertEmoji(entry,);
  },

  /**
   * Arrow-key navigation for the picker grid (wraps like the `/` popover).
   * @param {1 | -1} delta
   * @returns {void}
   */
  moveEmojiPickerSelection(delta: 1 | -1,) {
    if (this._emojiPickerResults.length === 0) { this.filterEmojiPicker(); }
    const count = this._emojiPickerResults.length;

    if (count === 0) { return; }
    this._emojiPickerActiveIndex = (this._emojiPickerActiveIndex + delta + count) % count;
  },
};
