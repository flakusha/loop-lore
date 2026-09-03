// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Command palette Alpine.js state slice.
 *
 * Hydrates its command list from `GET /api/commands` on init (single source
 * of truth — the assistant command registry). Falls back to an empty list
 * when the request fails so the UI degrades gracefully.
 * (WIRE-assistant-command-palette-stale-static-list: prior implementation
 * hardcoded 22 commands; new server-side commands were missing from the
 * palette until a FE rebuild. Now the registry drives the list.)
 */


import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "command-palette", },);


export const commandPalette: Partial<ChatState> & ThisType<ChatState> = {
  _showCommandPalette: false,
  _activeCommand: "",
  _commandList: [] as { name: string; descriptionKey: string; description: string }[],
  _filteredCommands: [] as { name: string; descriptionKey: string; description: string }[],

  async init(): Promise<void> {
    await this._loadCommandList();
  },

  async _loadCommandList(): Promise<void> {
    try {
      const res = await apiFetch("/api/commands",);
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
      }),);
      if (this._showCommandPalette) { this._filteredCommands = this._commandList; }
    } catch (err) {
      log.warn("command list fetch threw", { err, },);
    }
  },

  handleCommandInput(event: Event,) {
    const input = event.target as HTMLTextAreaElement;
    const value = input.value;
    if (value.startsWith("/",) && !value.includes(" ",)) {
      const query = value.slice(1,).toLowerCase();
      this._showCommandPalette = true;
      if (query) {
        const filtered: typeof this._commandList = [];
        for (const c of this._commandList) { if (c.name.includes(query,)) { filtered.push(c,); } }
        this._filteredCommands = filtered;
      } else {
        this._filteredCommands = this._commandList;
      }
    } else {
      this._showCommandPalette = false;
    }
  },

  selectCommand(name: string,) {
    const input = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (input) {
      input.value = `/${name} `;
      input.focus();
    }
    this._showCommandPalette = false;
  },
};
