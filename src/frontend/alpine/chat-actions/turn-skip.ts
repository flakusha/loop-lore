// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turn-skip actions — composer "Skip turn" integration (epic-actor-turn-skip).
 *
 * POSTs /api/v1/chats/:id/turn-skip with `{ mode: "hold" | "advance" }` and
 * refreshes the message list on success (the skip lands as a system message,
 * which the cascade filter already treats as opt-out). Errors surface through
 * the standard `show-toast` channel: 409 (refused_beat), 429 (rate limit),
 * and network failures are status-coded via the rejection thrown by apiFetch.
 */
import { requireActiveChat, } from "../chat-guards";
import type { TurnSkipMode, TurnSkipState, } from "../chat-types/turn-skip-state";
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "turn-skip", },);

type TurnSkipCtx = ChatState & TurnSkipState;

export const turnSkipActions: Partial<TurnSkipState> & ThisType<TurnSkipCtx> = {
  _turnSkipOpen: false,
  _skipping: false,

  /**
   * @returns {void}
   */
  toggleTurnSkip() {
    this._turnSkipOpen = !this._turnSkipOpen;
  },

  /**
   * @returns {void}
   */
  closeTurnSkip() {
    this._turnSkipOpen = false;
  },

  /** Escape hatch: open the skip choice when a hard gate blocks send. */
  /**
   * @returns {void}
   */
  suggestTurnSkip() {
    this._turnSkipOpen = true;
  },

  /**
   * Record a turn skip for the active chat and refresh the message list.
   * @param mode - `hold` records the opt-out; `advance` also cues the next beat.
   */
  async skipTurn(mode: TurnSkipMode,) {
    if (!requireActiveChat(this,)) { return; }
    if (this._skipping) { return; }
    this._skipping = true;
    this._turnSkipOpen = false;
    try {
      const res = await apiFetch(
        `/api/v1/chats/${this.activeChat}/turn-skip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ mode, },),
        } as Parameters<typeof apiFetch>[1],
      );
      // apiFetch resolves only 2xx — non-2xx reject into the catch below.
      const data = await res.json().catch(() => null) as { deduped?: boolean } | null;
      log.info("turn-skip recorded", { mode, deduped: data?.deduped === true, },);
      this.$dispatch?.("show-toast", {
        type: "success",
        message: mode === "advance" ? t("turnSkip.skippedAdvance",) : t("turnSkip.skipped",),
      },);
      await this.loadMessages();
    } catch (error) {
      // feFetch rejects non-2xx with the status attached; the response body
      // is dropped by safeFetch, so only status-coded toasts are possible.
      const status = (error as Error & { status?: number }).status;
      if (status === 429) {
        this.$dispatch?.("show-toast", { type: "warning", message: t("turnSkip.rateLimited",), },);
      } else if (status === 409) {
        this.$dispatch?.("show-toast", { type: "error", message: t("turnSkip.refused",), },);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("turnSkip.failed",), },);
      }
    } finally {
      this._skipping = false;
    }
  },
};
