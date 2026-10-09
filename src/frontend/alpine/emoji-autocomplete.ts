// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emoji typed-token helpers for the composer (`:` autocomplete + picker).
 *
 * Split from ./slash-autocomplete.ts to stay under the 250-line size gate.
 * The pure query/filter helpers live here; the `emojiAutocomplete` Alpine
 * slice owns the popover + picker state and is merged with
 * `slashAutocomplete` in `chat/bootstrap.ts`, so the composer sees one
 * combined state object exactly as before.
 */

import { listEmojiShortcodes, } from "./chat-utils/render";
import { emojiPicker, } from "./emoji-picker";
import type { ChatState, } from "./types";

/** Match a `:`-prefixed emoji token ending at the caret (start/whitespace-anchored, like slashTokenRe). */
export const emojiTokenRe = /(?:^|\s):([a-z0-9_+\-]*)(?=\s|$)/i;

export interface EmojiCandidate {
  name: string;
  emoji: string;
}

/**
 * Find the `:` emoji token ending at the caret, if any.
 * @param text
 */
export function findEmojiCaretToken(text: string,): RegExpExecArray | null {
  const anchored = new RegExp(emojiTokenRe.source, "gi",);

  for (let m = anchored.exec(text,); m; m = anchored.exec(text,)) {
    if (m.index + m[0].length === text.length) { return m; }
  }

  return null;
}

/**
 * Extract the `:` emoji query from text-up-to-caret.
 * @param beforeCursor - textarea value sliced to selectionStart.
 * @returns lowercase query (no leading `:`), or null when no emoji token at caret.
 */
export function extractEmojiQuery(beforeCursor: string,): string | null {
  const match = findEmojiCaretToken(beforeCursor,);

  if (!match) { return null; }
  // A fully-closed `:name:` token is a completed shortcode, not an open query.
  if (/:[a-z0-9_+\-]+:\s*$/i.test(beforeCursor,)) { return null; }

  return (match[1] ?? "").toLowerCase();
}

/**
 * Filter known emoji shortcodes by case-insensitive substring (registry order).
 * @param query - lowercase substring.
 * @returns matching `{ name, emoji }` pairs; empty query returns all.
 */
export function filterEmojiCandidates(query: string,): EmojiCandidate[] {
  const all = listEmojiShortcodes();

  if (query === "") { return all; }
  const needle = query.toLowerCase();

  return all.filter((entry,) => entry.name.toLowerCase().includes(needle,));
}

/**
 * Small edit-distance helper for unknown-command did-you-mean (≤2 = typo).
 * @param a
 * @param b
 * @returns Levenshtein distance between the lowercased inputs.
 */
export function editDistance(a: string, b: string,): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let prev: number[] = Array.from({ length: y.length + 1, }, (_, i,) => i,);

  for (let i = 1; i <= x.length; i++) {
    const curr: number[] = [i,];

    for (let j = 1; j <= y.length; j++) {
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1),);
    }

    prev = curr;
  }

  return prev[y.length]!;
}

/**
 * Closest registry name to an unknown slash command (null when nothing near).
 * @param names - registry names.
 * @param query - unknown command (no leading `/`).
 * @returns best match within distance 2, else null.
 */
export function didYouMeanCandidate(names: readonly string[], query: string,): string | null {
  let best: string | null = null;
  let bestScore = 3;

  for (const name of names) {
    const score = editDistance(name, query,);

    if (score < bestScore) {
      bestScore = score;
      best = name;
    }
  }

  return best;
}

export const emojiAutocomplete: Partial<ChatState> & ThisType<ChatState> = {
  // `:` emoji autocomplete shares the popup pattern with `/` (Tab-accept
  // parity, arrows + Enter + Escape). Fed by the allowlisted shortcode map.
  _emojiQuery: "",
  _emojiCandidates: [] as EmojiCandidate[],
  _showEmojiPopover: false,
  _emojiActiveIndex: 0,
  ...emojiPicker,

  /**
   * `:` emoji autocomplete — same popup pattern as `/` (Tab-accept parity).
   * A closed `:name:` shortcode is complete, so it closes the popover.
   * @param {Event} event
   * @returns {void}
   */
  handleEmojiInput(event: Event,) {
    const textarea = event.target as HTMLTextAreaElement;
    const beforeCursor = textarea.value.slice(0, textarea.selectionStart,);
    const query = extractEmojiQuery(beforeCursor,);

    if (query === null) {
      this.hideEmojiPopover();

      return;
    }

    this._emojiQuery = query;
    this._emojiCandidates = filterEmojiCandidates(query,);
    this._showEmojiPopover = true;
    this._emojiActiveIndex = 0;
  },

  /**
   * @param {EmojiCandidate} candidate
   * @returns {void}
   */
  selectEmojiCandidate(candidate: EmojiCandidate,) {
    const textarea = this.$refs?.messageInput as HTMLTextAreaElement | undefined;

    if (!textarea) { return; }
    const cursorPos = textarea.selectionStart;
    const beforeCursor = textarea.value.slice(0, cursorPos,);
    const afterCursor = textarea.value.slice(cursorPos,);
    const match = findEmojiCaretToken(beforeCursor,);

    if (!match) { return; }
    const matched = match[0];
    const trimmed = matched.trimStart();
    const sep = matched.slice(0, matched.length - trimmed.length,);
    // Insert the raw shortcode (not the glyph) so the sent text stays
    // portable and re-renders identically everywhere.
    const newBefore = beforeCursor.slice(0, match.index,) + sep + `:${candidate.name}: `;

    textarea.value = newBefore + afterCursor;
    textarea.selectionStart = textarea.selectionEnd = newBefore.length;
    this.hideEmojiPopover();
    textarea.focus();
  },

  /**
   * @returns {void}
   */
  hideEmojiPopover() {
    this._showEmojiPopover = false;
    this._emojiActiveIndex = 0;
    this._emojiQuery = "";
    this._emojiCandidates = [];
  },

  /**
   * @param {number} index
   * @returns {boolean}
   */
  acceptEmojiAtIndex(index: number,): boolean {
    const entry = this._emojiCandidates[index];

    if (!entry) { return false; }
    this.selectEmojiCandidate(entry,);

    return true;
  },

  /**
   * @param {1 | -1} delta
   * @returns {void}
   */
  moveEmojiSelection(delta: 1 | -1,) {
    const count = this._emojiCandidates.length;

    if (count === 0) { return; }
    this._emojiActiveIndex = (this._emojiActiveIndex + delta + count) % count;
  },

  /**
   * Mirror handleSlashKeydown for the `:` popover (Tab-accept parity).
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  handleEmojiKeydown(event: KeyboardEvent,) {
    const target = event.target as { tagName?: string } | null;

    if (!target || target.tagName !== "TEXTAREA") { return; }
    if (event.isComposing) { return; }
    if (!this._showEmojiPopover) { return; }
    if (this._emojiCandidates.length === 0) {
      if (event.key === "Escape") { this.hideEmojiPopover(); }

      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      this.acceptEmojiAtIndex(this._emojiActiveIndex,);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveEmojiSelection(1,);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveEmojiSelection(-1,);
    } else if (event.key === "Escape") {
      this.hideEmojiPopover();
    }
  },

  /**
   * @returns true when the emoji popover consumed the Enter press.
   */
  handleEmojiEnter(): boolean {
    if (!this._showEmojiPopover || this._emojiCandidates.length === 0) { return false; }

    return this.acceptEmojiAtIndex(this._emojiActiveIndex,);
  },
};
