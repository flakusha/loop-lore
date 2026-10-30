// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── NSFW Panel — Alpine state mixin ─────────────────────────
import type { NsfwBodyStatsView, NsfwIntimacyPairView, } from "../chat-types/nsfw-state";
import { apiFetch, } from "../htmx";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";
import { fetchBodyProfile, fetchIntimacyPairs, } from "./api";
import type { NsfwBodyProfileRow, NsfwIntimacyPairRow, } from "./api";

const log = rootLog.child({ module: "nsfw-panel", },);

/**
 * Resolve the chat character's actor id.
 *
 * Uses the same source as the RPG stats panel (`GET /api/v1/chats/:id` →
 * `character_id`): the chat's non-user participant.
 * @param chatId - the active chat id
 * @returns {Promise<string | null>}
 */
async function resolveCharacterId(chatId: string,): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}`,);
    if (!res.ok) { return null; }
    const chat = await res.json();
    const actorId = (chat as { character_id?: string | null }).character_id;
    return typeof actorId === "string" && actorId.length > 0 ? actorId : null;
  } catch {
    return null;
  }
}

/**
 * Map a raw intimacy row onto the panel's view model.
 * @param row - raw backend row
 * @returns {NsfwIntimacyPairView}
 */
function toPairView(
  row: NsfwIntimacyPairRow,
  names: Map<string, string>,
): NsfwIntimacyPairView {
  const targetActorId = row.targetActorId ?? "";
  return {
    actorId: row.actorId ?? "",
    targetActorId,
    targetDisplayName: names.get(targetActorId,) ?? null,
    score: typeof row.score === "number" ? row.score : 0,
    unlockedThresholds: Array.isArray(row.unlockedThresholds,) ? [...row.unlockedThresholds,] : [],
  };
}

/**
 * Map a raw body profile row onto the panel's view model.
 * @param row - raw backend row
 * @returns {NsfwBodyStatsView}
 */
function toBodyView(row: NsfwBodyProfileRow,): NsfwBodyStatsView {
  return {
    stamina: row.stamina ?? 0,
    flexibility: row.flexibility ?? 0,
    sensitivity: row.sensitivity ?? 0,
    endurance: row.endurance ?? 0,
    sizeCategory: row.sizeCategory ?? "average",
    build: row.build ?? "average",
  };
}

/** */
export const nsfwPanelState: Partial<ChatState> & ThisType<ChatState> = {
  _nsfwIntimacy: null,
  _nsfwBody: null,
  _nsfwUnavailable: false,

  /**
   * Load the read-only NSFW status for the active chat's character.
   *
   * Never rejects and never surfaces an error: a 403 means the viewer does
   * not own the character (the panel stays hidden), any other failure leaves
   * the affected section empty.
   * @returns {Promise<void>}
   */
  async loadNsfwPanel() {
    const chatId = this.activeChat;
    if (!chatId) {
      // A load captured for a chat that is no longer active must not clobber
      // the now-active chat's panel state.
      if (this.activeChat !== chatId) { return; }
      this._nsfwIntimacy = null;
      this._nsfwBody = null;
      this._nsfwUnavailable = false;
      return;
    }

    try {
      const actorId = await resolveCharacterId(chatId,);
      // The user may have switched chats while this load was in flight — a
      // stale load must not write state for a chat that is no longer active.
      if (this.activeChat !== chatId) { return; }
      if (!actorId) {
        this._nsfwIntimacy = null;
        this._nsfwBody = null;
        this._nsfwUnavailable = false;
        return;
      }

      // Sequential: both helpers swallow their own errors, so there is no
      // rejection to lose, and the two reads are cheap local queries.
      const intimacy = await fetchIntimacyPairs(actorId,);
      if (this.activeChat !== chatId) { return; }
      const body = await fetchBodyProfile(actorId,);
      if (this.activeChat !== chatId) { return; }

      // A 403 on either endpoint means the viewer cannot access this
      // character's NSFW state — hide the panel instead of showing a
      // partially-empty view.
      if (intimacy.status === "denied" || body.status === "denied") {
        this._nsfwUnavailable = true;
        this._nsfwIntimacy = null;
        this._nsfwBody = null;
        return;
      }

      this._nsfwUnavailable = false;
      const names = new Map(
        (this._participants ?? []).map((p,) => [p.actor_id, p.display_name,] as const),
      );

      this._nsfwIntimacy = intimacy.status === "ok" ? intimacy.data.map((row,) => toPairView(row, names,)) : null;
      this._nsfwBody = body.status === "ok" ? toBodyView(body.data,) : null;
    } catch (error) {
      // A failed load must not clear a newer chat's panel state either.
      if (this.activeChat !== chatId) { return; }
      log.error("Failed to load NSFW panel", error instanceof Error ? error : undefined, {},);
      this._nsfwIntimacy = null;
      this._nsfwBody = null;
      this._nsfwUnavailable = false;
    }
  },
};
