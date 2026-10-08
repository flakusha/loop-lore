// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Command palette Alpine.js state slice.
 *
 * Hydrates its command list from `GET /api/v1/commands` on init (single source
 * of truth — the assistant command registry). Falls back to an empty list
 * when the request fails so the UI degrades gracefully.
 * (WIRE-assistant-command-palette-stale-static-list: prior implementation
 * hardcoded 22 commands; new server-side commands were missing from the
 * palette until a FE rebuild. Now the registry drives the list.)
 */

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { log as rootLog, } from "../logger";
import { didYouMeanCandidate, } from "../slash-query";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "command-palette", },);

type PaletteEntry = { name: string; descriptionKey: string; description: string };

/**
 * Filter palette entries by substring, falling back to a single did-you-mean
 * suggestion when nothing matches (`/hep` → `/help`). Unrelated input still
 * yields an empty list. Tab/Enter accepts the suggestion; Escape dismisses.
 * @param entries - hydrated command list.
 * @param query - lowercase slash query (no leading `/`).
 * @returns matching entries, the did-you-mean entry, or [].
 */
function filterPaletteEntries(entries: PaletteEntry[], query: string,): PaletteEntry[] {
  const filtered: PaletteEntry[] = [];
  for (const c of entries) { if (c.name.toLowerCase().includes(query,)) { filtered.push(c,); } }
  if (filtered.length > 0) { return filtered; }
  const suggestion = didYouMeanCandidate(entries.map((c,) => c.name), query,);
  const match = suggestion === null ? undefined : entries.find((c,) => c.name === suggestion);
  return match === undefined ? [] : [match,];
}

export const commandPalette: Partial<ChatState> & ThisType<ChatState> = {
  _showCommandPalette: false,
  _activeCommand: "",
  _paletteActiveIndex: 0,
  _commandList: [] as { name: string; descriptionKey: string; description: string }[],
  _filteredCommands: [] as { name: string; descriptionKey: string; description: string }[],

  /**
   * @returns {Promise<void>}
   */
  async init(): Promise<void> {
    await this._loadCommandList();
  },

  /**
   * @returns {Promise<void>}
   */
  async _loadCommandList(): Promise<void> {
    try {
      const res = await apiFetch("/api/v1/commands",);
      if (!res.ok) {
        log.warn("command list fetch failed", { status: res.status, },);
        return;
      }

      const body = await res.json() as { data?: { name: string; descriptionKey: string }[] };
      const entries = Array.isArray(body.data,) ? body.data : [];
      this._commandList = entries.map((entry,) => ({
        name: entry.name,
        descriptionKey: entry.descriptionKey,
        description: t(entry.descriptionKey,),
      }));

      if (this._showCommandPalette) { this._filteredCommands = this._commandList; }
    } catch (err) {
      log.warn("command list fetch threw", { err, },);
    }
  },

  /**
   * @param {Event} event
   * @returns {void}
   */
  handleCommandInput(event: Event,) {
    const input = event.target as HTMLTextAreaElement;
    const value = input.value;
    if (value.startsWith("/",) && !value.includes(" ",)) {
      const query = value.slice(1,).toLowerCase();
      this._showCommandPalette = true;
      this._paletteActiveIndex = 0;
      if (query) {
        this._filteredCommands = filterPaletteEntries(this._commandList, query,);
      } else {
        this._filteredCommands = this._commandList;
      }
    } else {
      this._showCommandPalette = false;
    }
  },

  /**
   * @param {string} name
   * @returns {void}
   */
  selectCommand(name: string,) {
    const input = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (input) {
      input.value = `/${name} `;
      input.focus();
    }

    this._showCommandPalette = false;
  },

  /**
   * @param {number} index
   * @returns {void}
   */
  acceptPaletteAtIndex(index: number,) {
    const entry = this._filteredCommands[index];
    if (!entry) { return; }
    this.selectCommand(entry.name,);
  },

  /**
   * @param {1 | -1} delta
   * @returns {void}
   */
  movePaletteSelection(delta: 1 | -1,) {
    const count = this._filteredCommands.length;
    if (count === 0) { return; }
    this._paletteActiveIndex = (this._paletteActiveIndex + delta + count) % count;
  },
};
