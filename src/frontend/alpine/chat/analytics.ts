// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Per-chat analytics panel (FEAT-059 AC3) ────
// Consumes GET /api/v1/analytics/chats/:chatId. The route enforces auth
// server-side (401 anonymous / 404 without resource access); this module only
// renders the result and surfaces those two statuses as messages.

import { apiFetch, } from "../htmx";

/** Flattened stats rendered by the character-info panel. */
export interface ChatAnalytics {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  totalTokens: number;
  avgMessageLength: number;
  activeTimeSpanMs: number;
  totalGenerations: number;
  avgLatencyMs: number;
  costEstimate: number;
}

interface AnalyticsResponse {
  totalMessages?: number;
  messageCounts?: { user?: number; assistant?: number; system?: number };
  totalTokens?: number;
  avgMessageLength?: number;
  activeTimeSpanMs?: number;
  totalGenerations?: number;
  avgLatencyMs?: number;
  costEstimate?: number;
}

const EMPTY_STATS: ChatAnalytics = {
  totalMessages: 0,
  userMessages: 0,
  assistantMessages: 0,
  systemMessages: 0,
  totalTokens: 0,
  avgMessageLength: 0,
  activeTimeSpanMs: 0,
  totalGenerations: 0,
  avgLatencyMs: 0,
  costEstimate: 0,
};

/** Map the route payload explicitly so a zero-row chat still renders zeros. */
function mapStats(body: AnalyticsResponse,): ChatAnalytics {
  return {
    totalMessages: body?.totalMessages ?? 0,
    userMessages: body?.messageCounts?.user ?? 0,
    assistantMessages: body?.messageCounts?.assistant ?? 0,
    systemMessages: body?.messageCounts?.system ?? 0,
    totalTokens: body?.totalTokens ?? 0,
    avgMessageLength: body?.avgMessageLength ?? 0,
    activeTimeSpanMs: body?.activeTimeSpanMs ?? 0,
    totalGenerations: body?.totalGenerations ?? 0,
    avgLatencyMs: body?.avgLatencyMs ?? 0,
    costEstimate: body?.costEstimate ?? 0,
  };
}

type AlpineLike = { $data?: (el: unknown,) => Record<string, unknown> | undefined };

function isAlpineLike(value: unknown,): value is AlpineLike {
  return typeof value === "object" && value !== null && "$data" in value;
}

/** Resolve the enclosing chatState's active chat (same seam as mobileComposer). */
function parentChatId(self: unknown,): string | null {
  if (!self || typeof self !== "object" || !("$el" in self)) { return null; }
  const el = self.$el;
  const globalRef = globalThis as Record<string, unknown>; // globalThis has no typed Alpine key
  const alpine = globalRef.Alpine;
  if (!el || typeof el !== "object" || !isAlpineLike(alpine,) || !alpine.$data) { return null; }
  const parent = alpine.$data(el,);

  return typeof parent?.activeChat === "string" ? parent.activeChat : null;
}

/** Alpine component for the character-info panel's compact chat stats block. */
export function chatAnalytics() {
  return {
    chatStats: { ...EMPTY_STATS, },
    chatStatsLoading: false,
    chatStatsError: "",
    _statsRequest: 0,
    _statsChatId: null as string | null,

    async loadChatAnalytics(chatId?: string,) {
      const id = chatId ?? parentChatId(this,);
      if (!id) { return; }

      // A newer chat/request wins: discard stale responses before writing state.
      const request = ++this._statsRequest;
      if (this._statsChatId !== id) {
        this.chatStats = { ...EMPTY_STATS, };
        this._statsChatId = id;
      }

      this.chatStatsError = "";
      this.chatStatsLoading = true;

      try {
        const res = await apiFetch(`/api/v1/analytics/chats/${encodeURIComponent(id,)}`, {
          headers: { Accept: "application/json", },
        },);

        if (res.status === 401) {
          if (request === this._statsRequest) { this.chatStatsError = "Sign in to view chat stats."; }
          return;
        }

        if (res.status === 404) {
          if (request === this._statsRequest) { this.chatStatsError = "Chat stats are unavailable."; }
          return;
        }

        if (!res.ok) { throw new Error(`analytics ${res.status}`,); }

        const body = await res.json() as AnalyticsResponse;
        if (request !== this._statsRequest) { return; }
        this.chatStats = mapStats(body,);
      } catch {
        if (request === this._statsRequest) { this.chatStatsError = "Could not load chat stats."; }
      } finally {
        if (request === this._statsRequest) { this.chatStatsLoading = false; }
      }
    },
  };
}
