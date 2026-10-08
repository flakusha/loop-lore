// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Command palette Alpine.js state slice.
 *
 * Hydrates its command list from `GET /api/v1/commands` on init (single source
 * of truth — the assistant command registry). Passes the active chat id when
 * known so the server can return per-entry `requiredRole` + caller
 * `roleInChat`; entries the caller's role does not satisfy are hidden.
 * Unknown role fails open (show all) — display-only, the server still denies.
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

export interface PaletteCommand {
  name: string;
  descriptionKey: string;
  description: string;
  requiredRole?: string;
}

/** Role privilege ordering shared with the BE registry (observer < member < owner). */
const PALETTE_ROLE_PRIORITY: Record<string, number> = {
  guest: -1,
  observer: 0,
  member: 1,
  owner: 2,
};

/**
 * Whether the viewer's role satisfies a command's minimum required role.
 * @param actual - viewer role (defaults to member when unknown).
 * @param required - minimum role, if any.
 * @returns true when unrestricted or the viewer meets the minimum.
 */
export function satisfiesPaletteRole(actual: string | undefined, required: string | undefined,): boolean {
  if (!required) { return true; }
  return (PALETTE_ROLE_PRIORITY[actual ?? "member"] ?? 1) >= (PALETTE_ROLE_PRIORITY[required] ?? 0);
}

type PaletteEntry = { name: string; descriptionKey: string; description: string; requiredRole?: string };

/**
 * Client mirror of the registry's role ordering (guest < observer < member/gm < owner).
 * Display-only: the server dispatch gate still denies unauthorized runs.
 * Unknown roles fail open (entry shown).
 * @param actual - caller's role in the chat, if known
 * @param required - minimum role the entry requires, if any
 * @returns true when the entry should stay visible
 */
function satisfiesClientRole(actual: string | undefined, required: string | undefined,): boolean {
  if (!required) { return true; }
  if (!actual) { return true; }
  const order: Record<string, number> = { guest: -1, observer: 0, member: 1, gm: 1, owner: 2, };
  const a = order[actual];
  const r = order[required];
  if (a === undefined || r === undefined) { return true; }
  return a >= r;
}
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
const chatId = typeof this.activeChat === "string" ? this.activeChat : undefined;
      const url = chatId ? `/api/v1/commands?chatId=${encodeURIComponent(chatId,)}` : "/api/v1/commands";
      const res = await apiFetch(url,);
      if (!res.ok) {
        log.warn("command list fetch failed", { status: res.status, },);
        return;
      }

      const body = await res.json() as {
        data?: { name: string; descriptionKey: string; requiredRole?: string }[];
        roleInChat?: string;
      };

      const entries = Array.isArray(body.data,) ? body.data : [];
      const roleInChat = typeof body.roleInChat === "string" ? body.roleInChat : undefined;
      const visible = entries.filter((entry,) => satisfiesClientRole(roleInChat, entry.requiredRole,));
      this._commandList = visible.map((entry,) => ({
        name: entry.name,
        descriptionKey: entry.descriptionKey,
        description: t(entry.descriptionKey,),
        ...(entry.requiredRole ? { requiredRole: entry.requiredRole, } : {}),
      }));

      // Slice-safe: tests invoke this on partial state without the composed
      // helpers, so call the module's own methods instead of this-dispatch.
      if (this._showCommandPalette) {
        commandPalette._applyPaletteFilter?.call(this, commandPalette._viewerRole?.call(this,) ?? "member",);
      }
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
      this._activeCommand = query;
      // Slice-safe: partial contexts may lack the composed helpers, so call
      // the module's own methods with this state instead of this-dispatch.
      commandPalette._applyPaletteFilter?.call(this, commandPalette._viewerRole?.call(this,) ?? "member",);
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

  /**
   * Viewer role for capability gating (falls back to member when unknown).
   * @returns {string}
   */
  _viewerRole(): string {
    const role = (this as { userRole?: string }).userRole ?? (this as { user?: { role?: string } }).user?.role;
    return role ?? "member";
  },

  /**
   * Commands visible to the current viewer (disallowed hidden, counted).
   * @returns {typeof this._filteredCommands}
   */
  _visibleCommands() {
    // Slice-safe: partial state may carry a viewer role without the helper.
    const role = commandPalette._viewerRole?.call(this,) ?? "member";
    return (this._commandList ?? []).filter((entry,) => satisfiesPaletteRole(role, entry.requiredRole,));
  },

  /**
   * Recompute the filtered list for a query, hiding disallowed commands.
   * @param {string} role
   * @returns {void}
   */
  _applyPaletteFilter(role: string,) {
    const query = (this._activeCommand ?? "").toLowerCase();
    const visible = (this._commandList ?? []).filter((entry,) => satisfiesPaletteRole(role, entry.requiredRole,));
    this._hiddenCommandCount = (this._commandList ?? []).length - visible.length;
    this._filteredCommands = query ? filterPaletteEntries(visible, query,) : visible;

    this._paletteActiveIndex = 0;
  },
};
