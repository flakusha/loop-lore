// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Body State — Alpine state mixin ─────────────────────────
import { type BodyConditionView, type BodyStateView, renderBodyState, } from "../../nsfw/body-state";
import { apiFetch, } from "../htmx";
import { log as rootLog, } from "../logger";
import type { NsfwFetchResult, } from "../nsfw-panel/api";
import type { ChatState, } from "../types";
import { fetchArousalState, fetchRpgStats, parseConditionsJson, } from "./api";
import type { ArousalRow, RawCondition, RpgStatsRow, } from "./api";

const log = rootLog.child({ module: "nsfw-body", },);

/** Chat JSON shape the mixin needs from GET /api/v1/chats/:id. */
interface ChatCharacterRef {
  character_id?: string | null;
  world_id?: string | null;
}

/**
 * Resolve the chat character's actor id and world id.
 *
 * Both come from the same `GET /api/v1/chats/:id` response the RPG stats and
 * NSFW panels already use — one request, no extra round trip.
 * @param chatId - the active chat id
 * @returns {Promise<ChatCharacterRef | null>} null when the chat is unreadable
 */
async function resolveCharacterRef(chatId: string,): Promise<ChatCharacterRef | null> {
  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}`,);
    if (!res.ok) { return null; }
    return (await res.json()) as ChatCharacterRef;
  } catch {
    return null;
  }
}

/**
 * Map a raw conditions array onto the widget's condition view rows.
 * @param rows - parsed conditions JSON entries
 * @returns {BodyConditionView[]}
 */
function toConditionViews(rows: RawCondition[],): BodyConditionView[] {
  return rows.map((row,) => ({
    id: (row.name ?? "").toLowerCase().replaceAll(/\s+/gu, "_",),
    name: row.name ?? "",
    source: typeof row.source === "string" && row.source.length > 0 ? row.source : null,
    durationTurns: typeof row.duration_rounds === "number" ? row.duration_rounds : null,
  }));
}

/**
 * Map the two fetch outcomes onto the widget's view model.
 *
 * Sections are independent: a failed or denied fetch blanks only its own
 * section, mirroring the read-only status panel's partial-failure contract.
 * A 403 on the arousal endpoint means the viewer lacks NSFW access — the
 * arousal row is dropped while health and conditions still render.
 * @param stats - rpg stats fetch outcome (health + conditions)
 * @param arousal - arousal fetch outcome
 * @returns {BodyStateView | null} null when nothing at all is renderable
 */
export function toBodyStateView(
  stats: NsfwFetchResult<RpgStatsRow>,
  arousal: NsfwFetchResult<ArousalRow>,
): BodyStateView | null {
  const health = stats.status === "ok"
    ? { hp: stats.data.hp ?? 0, maxHp: stats.data.maxHp ?? 0, }
    : null;

  const conditions = stats.status === "ok" ? toConditionViews(parseConditionsJson(stats.data.conditions,),) : [];
  const arousalView = arousal.status === "ok" && typeof arousal.data.level === "number"
    ? { level: arousal.data.level, }
    : null;

  if (!health && conditions.length === 0 && !arousalView) { return null; }
  return { health, arousal: arousalView, conditions, };
}

/** */
export const bodyStateState: Partial<ChatState> & ThisType<ChatState> = {
  _bodyStateView: null,

  /**
   * Mount (or clear) the body-state widget in the character-info slot.
   *
   * Called after every load/reset so the DOM always matches the view state;
   * a missing slot (panel not rendered) is a no-op, as in the battle panel.
   * @returns {void}
   */
  mountBodyState() {
    const slot = this.$refs?.bodyStatePanel as HTMLElement | undefined;
    if (!slot) { return; }
    slot.replaceChildren();
    if (!this._bodyStateView) { return; }
    const section = renderBodyState(this._bodyStateView,);
    if (section) { slot.append(section,); }
  },

  /**
   * Load health, conditions and arousal for the active chat's character.
   *
   * Never rejects and never surfaces an error: each fetch outcome blanks only
   * its own section, and a chat switch while a load is in flight discards the
   * stale result.
   * @returns {Promise<void>}
   */
  async loadBodyState() {
    const chatId = this.activeChat;
    if (!chatId) {
      // No active chat: reset so stale state is not shown for a chat that has
      // already been closed.
      this._bodyStateView = null;
      this.mountBodyState();
      return;
    }

    try {
      const ref = await resolveCharacterRef(chatId,);
      // The user may have switched chats while this load was in flight — a
      // stale load must not write state for a chat that is no longer active.
      if (this.activeChat !== chatId) { return; }
      const actorId = ref?.character_id;
      if (!ref || typeof actorId !== "string" || actorId.length === 0) {
        this._bodyStateView = null;
        this.mountBodyState();
        return;
      }

      const worldId = typeof ref.world_id === "string" && ref.world_id.length > 0 ? ref.world_id : null;

      // Sequential: both helpers swallow their own errors, so there is no
      // rejection to lose, and the two reads are cheap local queries.
      const stats = await fetchRpgStats(actorId,);
      if (this.activeChat !== chatId) { return; }
      const arousal = await fetchArousalState(actorId, worldId,);
      if (this.activeChat !== chatId) { return; }

      this._bodyStateView = toBodyStateView(stats, arousal,);
      this.mountBodyState();
    } catch (error) {
      // A failed load must not clear a newer chat's widget state either.
      if (this.activeChat !== chatId) { return; }
      log.error("Failed to load body state", error instanceof Error ? error : undefined, {},);
      this._bodyStateView = null;
      this.mountBodyState();
    }
  },
};
