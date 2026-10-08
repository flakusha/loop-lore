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

import type { ChatState, } from "./types";

/**
 * Match a `/`-prefixed command token within the text-before-caret.
 * - (?:^|\s) requires the token to start at line start or after whitespace,
 *   so emails/URLs/words do not accidentally trigger.
 * - The captured name is optional so a bare `/` still opens the popover.
 * - The trailing lookahead `(?=\s|$)` accepts the token when followed by
 *   whitespace (user typing args like `/roll 2d6`) or end-of-string, without
 *   consuming the whitespace so subsequent calls re-match the same token.
 */
export const slashTokenRe = /(?:^|\s)\/([a-z][a-z0-9_-]*)?(?=\s|$)/i;

/**
 * Find the slash token that ENDS at the caret (end of `text`). Only such a
 * token may trigger interception, so stale tokens earlier in the message
 * (e.g. a fully typed `/cmd args`) never do.
 * @param text - Text up to and including the caret position.
 * @returns The match whose end equals `text.length`, or null.
 */
function findCaretToken(text: string,): RegExpExecArray | null {
  const anchored = new RegExp(slashTokenRe.source, "g",);
  for (let m = anchored.exec(text,); m; m = anchored.exec(text,)) {
    if (m.index + m[0].length === text.length) { return m; }
  }

  return null;
}

export interface SlashCandidate {
  name: string;
  description: string;
  descriptionKey: string;
}

/**
 * Extract the slash-token query from text-up-to-caret.
 * @param beforeCursor - textarea value sliced to selectionStart.
 * @returns lowercase query string (no leading `/`), or null when no slash
 *   token is present at the caret.
 */
export function extractSlashQuery(beforeCursor: string,): string | null {
  const match = findCaretToken(beforeCursor,);
  if (!match) { return null; }
  return (match[1] ?? "").toLowerCase();
}

/**
 * Filter and order slash candidates by case-insensitive substring match.
 * @param names - available command names (registry order preserved).
 * @param query - lowercase substring to match against each name.
 * @returns names whose lowercased form contains the query, in registry
 *   order. Empty query returns every name.
 */
export function filterSlashCandidates(
  names: readonly string[],
  query: string,
): string[] {
  if (query === "") { return [...names,]; }
  const out: string[] = [];
  const needle = query.toLowerCase();
  for (const name of names) {
    if (name.toLowerCase().includes(needle,)) { out.push(name,); }
  }

  if (out.length > 0) { return out; }
  const suggestion = didYouMeanCandidate(names, needle,);
  return suggestion === null ? [] : [suggestion,];
}

/**
 * Did-you-mean fallback: closest registry name to a zero-substring-match
 * query, or null when nothing is close enough to suggest. Tab/Enter accepts
 * the suggestion explicitly; Escape dismisses it untouched.
 * @param names - available command names.
 * @param needle - lowercase query with no substring hit.
 * @returns the single closest name, or null.
 */
export function didYouMeanCandidate(names: readonly string[], needle: string,): string | null {
  // ponytail: O(n·m) scan over the ~50-command registry; index it if the list grows 10x.
  const query = needle.toLowerCase();
  if (query === "") { return null; }
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const name of names) {
    const lower = name.toLowerCase();
    const score = lower.startsWith(query,) ? 0 : editDistance(query, lower,);
    if (score < bestScore) {
      bestScore = score;
      best = name;
    }
  }

  if (best === null || bestScore > Math.max(1, Math.floor(query.length / 2,),)) { return null; }
  return best;
}

/**
 * Bounded Levenshtein distance (iterative, single row).
 * @param a - first string (already lowercased).
 * @param b - second string (already lowercased).
 * @returns edit distance between the two strings.
 */
function editDistance(a: string, b: string,): number {
  let prev: number[] = Array.from({ length: b.length + 1, }, (_, i,) => i,);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i,];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    prev = curr;
  }

  return prev[b.length] ?? 0;
}

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
    const textarea = event.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart;
    const beforeCursor = value.slice(0, cursorPos,);
    const query = extractSlashQuery(beforeCursor,);
    if (query === null) {
      this.hideSlashPopover();
      return;
    }

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
