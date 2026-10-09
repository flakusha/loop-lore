// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Slash-command typed-token autocomplete.
 *
 * Mirrors the @mention autocomplete pattern (chat-group.ts:77-149) for
 * `/`-prefixed assistant commands. Triggered when the composer caret sits
 * at the end of a `/`-prefixed token (start of line or after whitespace,
 * optional trailing whitespace). The candidate list comes from the same
 * source of truth as command-palette.ts (`GET /api/v1/commands`), so the
 * popover never drifts from the live command registry.
 *
 * ponytail: regex requires `[a-z][a-z0-9_-]*` so a bare `/` triggers the
 * popover with the full list (matching command-palette behavior). Upgrade
 * path: switch to the registry's full metadata (description, role hint)
 * when the candidate row needs more than the name.
 */

import {
  extractSlashQuery,
  filterSlashCandidates,
  findCaretToken,
  type SlashCandidate,
} from "./slash-query";
import type { ChatState, } from "./types";

export const slashAutocomplete: Partial<ChatState> & ThisType<ChatState> = {
  _slashQuery: "",
  _slashCandidates: [] as SlashCandidate[],
  _showSlashPopover: false,
  _slashActiveIndex: 0,

  /**
   * @param {Event} event
   * @returns {void}
   */
  handleSlashInput(event: Event,) {
    // Slash takes precedence; when no `/` token is at the caret, fall
    // through to `:` emoji autocomplete so one input handler drives both.
    const textarea = event.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos,);
    const query = extractSlashQuery(beforeCursor,);
    if (query === null) {
      this.hideSlashPopover();
      this.handleEmojiInput?.(event,);
      return;
    }

    this.hideEmojiPopover?.();
    const list = this._commandList ?? [];
    const names = list.map((entry,) => entry.name);
    const matched = filterSlashCandidates(names, query,);
    const lookup: Record<string, SlashCandidate> = {};
    for (const entry of list) { lookup[entry.name] = entry; }
    this._slashQuery = query;
    this._slashCandidates = matched.map((name,) =>
      lookup[name] ?? { name, description: "", descriptionKey: `commands.${name}`, }
    );

    this._showSlashPopover = true;
    this._slashActiveIndex = 0;
  },

  /**
   * @param {SlashCandidate} candidate
   * @returns {void}
   */
  selectSlashCandidate(candidate: SlashCandidate,) {
    const textarea = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (!textarea) { return; }
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos,);
    const afterCursor = value.slice(cursorPos,);
    const replacement = `/${candidate.name} `;
    // Replace the caret-anchored token (the one that opened the popover),
    // never an earlier token elsewhere in the text.
    const match = findCaretToken(beforeCursor,);
    if (!match) { return; }
    const matched = match[0];
    // Preserve the leading separator (start-of-string or whitespace) so we
    // do not collapse the gap between the prior text and the command.
    const trimmed = matched.trimStart();
    const sep = matched.slice(0, matched.length - trimmed.length,);
    const newBefore = beforeCursor.slice(0, match.index,) + sep + replacement;
    textarea.value = newBefore + afterCursor;
    const caret = newBefore.length;
    textarea.selectionStart = textarea.selectionEnd = caret;
    this.hideSlashPopover();
    textarea.focus();
  },

  /**
   * @returns {void}
   */
  hideSlashPopover() {
    this._showSlashPopover = false;
    this._slashActiveIndex = 0;
    this._slashQuery = "";
    this._slashCandidates = [];
  },

  /**
   * @param {number} index
   * @returns {boolean}
   */
  acceptSlashAtIndex(index: number,): boolean {
    const entry = this._slashCandidates[index];
    if (!entry) { return false; }
    this.selectSlashCandidate(entry,);
    return true;
  },

  /**
   * @param {1 | -1} delta
   * @returns {void}
   */
  moveSlashSelection(delta: 1 | -1,) {
    const count = this._slashCandidates.length;
    if (count === 0) { return; }
    this._slashActiveIndex = (this._slashActiveIndex + delta + count) % count;
  },

  /**
   * Keyboard handler for slash popover navigation. Wired in input-area.html
   * alongside chat-group.handleComposerKeydown so the two can coexist; chat
   * owns mention keys, this owns slash keys, Escape closes whichever is
   * open (slash last so chat-group's draft flush stays harmless).
   * @param event - keydown event from the composer textarea.
   */
  handleSlashKeydown(event: KeyboardEvent,) {
    // Emoji popover first: both can never be open at once (handleSlashInput
    // closes the other), so whichever is open owns Tab/arrows/Escape.
    if (this._showEmojiPopover) {
      this.handleEmojiKeydown?.(event,);
      return;
    }

    const target = event.target as { tagName?: string } | null;
    if (!target || target.tagName !== "TEXTAREA") { return; }
    if (event.isComposing) { return; }
    if (!this._showSlashPopover) { return; }
    if (this._slashCandidates.length === 0) {
      if (event.key === "Escape") { this.hideSlashPopover(); }
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      this.acceptSlashAtIndex(this._slashActiveIndex,);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSlashSelection(1,);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveSlashSelection(-1,);
    } else if (event.key === "Escape") {
      this.hideSlashPopover();
    }
  },

  /**
   * Mirror chat-group.handleComposerEnter: when slash popover is open with
   * candidates, Enter accepts the active one instead of sending the message.
   * Returns true when handled so the template can short-circuit chat-group's
   * handleComposerEnter and avoid sending the message prematurely.
   * @returns true when the slash popover consumed the Enter press.
   */
  handleSlashEnter(): boolean {
    if (!this._showSlashPopover || this._slashCandidates.length === 0) { return false; }
    return this.acceptSlashAtIndex(this._slashActiveIndex,);
  },
};

/** Re-exported for backward compatibility: chat-send.ts and existing tests
 *  import these helpers from `./slash-autocomplete`. New code SHOULD import
 *  from `./emoji-autocomplete` directly. Kept so `chat-send.ts` (did-you-mean)
 *  and the existing emoji tests keep working without a multi-file churn.
 */
export type { EmojiCandidate, } from "./emoji-autocomplete";
export {
  editDistance,
  emojiTokenRe,
  extractEmojiQuery,
  filterEmojiCandidates,
} from "./emoji-autocomplete";
export { didYouMeanCandidate, } from "./slash-query";
