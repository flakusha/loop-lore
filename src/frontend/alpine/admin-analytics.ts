// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Admin analytics tab (admin.html) — FEAT-059 dashboard charts ──

import { t, } from "./i18n";

interface ConversationOverview {
  totalMessages: number;
  totalTokens: number;
  tokensByRole?: { user: number; assistant: number; system: number };
  averageSessionLength: number;
  totalGenerations: number;
  avgLatencyMs: number;
  latencyBuckets?: { label: string; count: number }[];
  costEstimate: number;
  topChats: { id: string; name: string; totalMessages: number; totalTokens: number }[];
}

interface CharacterStat {
  id: string;
  name: string;
  totalMessages: number;
  totalTokens: number;
  avgResponseLength: number;
  tokensPerMessage: number;
}

const ROLE_COLORS = { user: "#4f46e5", assistant: "#059669", system: "#d97706", } as const;

/** Analytics state + loaders for the admin page. */
export const adminAnalytics = {
  analyticsSummary: { total: 0, distinct_sessions: 0, distinct_users: 0, },
  dailyStats: [] as { count: number; active_users: number; date: string }[],
  errorEvents: [] as { id: string; event_type: string; session_id: string | null; created_at: string }[],
  conversationOverview: {
    totalMessages: 0,
    totalTokens: 0,
    tokensByRole: { user: 0, assistant: 0, system: 0, },
    averageSessionLength: 0,
    totalGenerations: 0,
    avgLatencyMs: 0,
    latencyBuckets: [] as { label: string; count: number }[],
    costEstimate: 0,
    topChats: [] as { id: string; name: string; totalMessages: number; totalTokens: number }[],
  } as ConversationOverview,
  analyticsCharacters: [] as CharacterStat[],
  // Chart-ready projections computed on load so the template stays dumb.
  analyticsDailyBars: [] as { date: string; count: number; pct: number }[],
  analyticsLatencyBars: [] as { label: string; count: number; pct: number }[],
  analyticsRoleSegments: [] as { role: string; label: string; tokens: number; color: string; pct: number }[],
  loadingAnalytics: false,
  purgingAnalytics: false,

  /**
   * @returns {Promise<void>}
   */
  async loadAnalytics() {
    this.loadingAnalytics = true;
    try {
      const [summaryRes, dailyRes, errorsRes, conversationRes, charactersRes,] = await Promise.allSettled([
        apiFetch("/api/v1/telemetry/analytics/summary", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/telemetry/analytics/daily?limit=30", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/telemetry/analytics/errors", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/analytics/overview", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/analytics/characters", { headers: { Accept: "application/json", }, },),
      ],);
      if (
        summaryRes.status !== "fulfilled" || dailyRes.status !== "fulfilled" || errorsRes.status !== "fulfilled" ||
        conversationRes.status !== "fulfilled" || charactersRes.status !== "fulfilled"
      ) {
        throw new Error("analytics load failed",);
      }
      if (summaryRes.value.ok) { this.analyticsSummary = await summaryRes.value.json(); }
      if (dailyRes.value.ok) { this.dailyStats = await dailyRes.value.json(); }
      if (errorsRes.value.ok) { this.errorEvents = await errorsRes.value.json(); }
      if (conversationRes.value.ok) {
        const overview = await conversationRes.value.json() as ConversationOverview;
        this.conversationOverview = overview;
        const roles = overview.tokensByRole ?? { user: 0, assistant: 0, system: 0, };
        const roleTotal = roles.user + roles.assistant + roles.system;
        this.analyticsRoleSegments = [
          { role: "user", label: t("admin.roleUser",), tokens: roles.user, color: ROLE_COLORS.user, },
          {
            role: "assistant",
            label: t("admin.roleAssistant",),
            tokens: roles.assistant,
            color: ROLE_COLORS.assistant,
          },
          { role: "system", label: t("admin.roleSystem",), tokens: roles.system, color: ROLE_COLORS.system, },
        ].map((seg,) => ({ ...seg, pct: roleTotal > 0 ? Math.round(seg.tokens / roleTotal * 100,) : 0, }));
        const maxDaily = Math.max(1, ...this.dailyStats.map((d,) => d.count),);
        this.analyticsDailyBars = this.dailyStats.map((d,) => ({
          date: d.date,
          count: d.count,
          pct: Math.round(d.count / maxDaily * 100,),
        }));
        const buckets = overview.latencyBuckets ?? [];
        const maxLatency = Math.max(1, ...buckets.map((b,) => b.count),);
        this.analyticsLatencyBars = buckets.map((b,) => ({
          label: b.label,
          count: b.count,
          pct: Math.round(b.count / maxLatency * 100,),
        }));
      }
      if (charactersRes.value.ok) {
        const chars = await charactersRes.value.json() as { characters?: CharacterStat[] };
        this.analyticsCharacters = chars.characters ?? [];
      }
    } catch {
      showToast("error", t("toasts.failedLoadAnalytics",),);
    } finally {
      this.loadingAnalytics = false;
    }
  },

  /**
   * @returns {Promise<void>}
   */
  async purgeAnalytics() {
    if (this.purgingAnalytics) { return; }
    this.purgingAnalytics = true;
    try {
      const res = await apiFetch("/api/v1/telemetry/analytics/purge?days=90", { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.telemetryPurged",),);
        await this.loadAnalytics();
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.purgingAnalytics = false;
    }
  },
};
