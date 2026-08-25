// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging — Chat Scheduler
 *
 * Polls the server for due proactive messages and triggers a send when one
 * is ready. The server owns the timing/quiet-hours/backoff decision via
 * `checkShouldMessage`; this client only asks "is anything due?" and fires the
 * send endpoint once per tick. A proactive send streams the character's reply
 * through the existing generation SSE, so the message appears in-chat
 * automatically.
 */
import { apiFetch, } from "./htmx";
import type { ChatState, } from "./types";

const POLL_INTERVAL_MS = 60_000;
/** Minimum wall-clock time between proactive sends (anti-flood guard). */
const MIN_BETWEEN_SENDS_MS = 10_000;

/** A proactive config row as returned by the configs endpoint. */
interface ProactiveConfigRow {
  actorId: string;
  enabled: boolean;
}

export const chatProactive: Partial<ChatState> & ThisType<ChatState> = {
  _proactiveTimer: null as ReturnType<typeof setInterval> | null,
  _proactiveInFlight: false,
  _proactiveLastSendAt: 0,

  /** Begin polling for due proactive messages for the active chat. */
  startProactiveScheduler() {
    if (!this.activeChat) { return; }
    this.stopProactiveScheduler();
    void this.tickProactive();
    this._proactiveTimer = setInterval(() => {
      void this.tickProactive();
    }, POLL_INTERVAL_MS,);
  },

  /** Stop the scheduler (e.g. on component destroy). */
  stopProactiveScheduler() {
    if (!this._proactiveTimer) { return; }
    clearInterval(this._proactiveTimer,);
    this._proactiveTimer = null;
  },

  /** One poll: fetch configs, check each enabled one, send the first due. */
  async tickProactive() {
    const chatId = this.activeChat;
    if (!chatId || this._proactiveInFlight) { return; }
    if (Date.now() - this._proactiveLastSendAt < MIN_BETWEEN_SENDS_MS) { return; }

    try {
      const configsRes = await apiFetch(`/api/proactive-messaging/configs?chatId=${chatId}`,);
      // The user may have switched chats while the fetch was in flight — a
      // tick must never fire against an abandoned chat.
      if (this.activeChat !== chatId) { return; }
      if (!configsRes.ok) { return; }
      const configs = (await configsRes.json()) as ProactiveConfigRow[];

      for (const cfg of configs) {
        if (!cfg.enabled) { continue; }
        const checkRes = await apiFetch(
          `/api/proactive-messaging/check?chatId=${chatId}&actorId=${cfg.actorId}`,
        );
        if (this.activeChat !== chatId) { return; }
        if (!checkRes.ok) { continue; }
        const result = (await checkRes.json()) as { shouldMessage: boolean };
        if (!result.shouldMessage) { continue; }

        this._proactiveInFlight = true;
        try {
          const sendRes = await apiFetch(
            `/api/proactive-messaging/send?chatId=${chatId}&actorId=${cfg.actorId}`,
            { method: "POST", },
          );
          if (sendRes.ok || sendRes.status === 409) {
            // Sent, or already-not-due (another tick won the race) — either
            // way the backoff/last_proactive_at advanced server-side.
            this._proactiveLastSendAt = Date.now();
          }
        } finally {
          this._proactiveInFlight = false;
        }
        break; // at most one send per tick
      }
    } catch {
      /* transient — retry next tick */
    }
  },
};
