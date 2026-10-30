// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Admin analytics tab (admin.html) — FEAT-059 dashboard charts ──

import { t, } from "./i18n";

interface ConversationOverview {
  totalMessages: number;
  totalTokens: number;
  tokensByRole?: { user?: number; assistant?: number; system?: number };
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

interface QualityTotals {
  generations: number;
  withQualityMetrics: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  avgTokensPerSecond: number;
  avgRepetitionRate: number;
}

interface QualityModelRow {
  model: string | null;
  provider: string | null;
  generations: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  avgTokensPerSecond: number;
  avgRepetitionRate: number;
}

interface QualityTrendRow {
  date: string;
  generations: number;
  totalTokens: number;
  avgLatencyMs: number;
  avgTokensPerSecond: number;
  avgRepetitionRate: number;
}

interface QualityResponse {
  totals?: QualityTotals;
  byModel?: QualityModelRow[];
  trend?: QualityTrendRow[];
  finishReasons?: { reason: string; count: number }[];
}

/** Scale a value against the series max as a CSS bar percentage. */
function barPct(value: number, max: number,): number {
  return max > 0 ? Math.round(value / max * 100,) : 0;
}

/** Project the quality trend rows into CSS-bar friendly series. */
function projectQualityTrend(
  rows: QualityTrendRow[] | undefined,
): (QualityTrendRow & { latencyPct: number; tokensPerSecondPct: number; repetitionPct: number })[] {
  const trend = Array.isArray(rows,) ? rows : [];
  const maxLatency = Math.max(1, ...trend.map((r,) => r?.avgLatencyMs ?? 0),);
  const maxTps = Math.max(1, ...trend.map((r,) => r?.avgTokensPerSecond ?? 0),);
  const maxRep = Math.max(0.0001, ...trend.map((r,) => r?.avgRepetitionRate ?? 0),);
  return trend.map((r,) => ({
    ...r,
    latencyPct: barPct(r?.avgLatencyMs ?? 0, maxLatency,),
    tokensPerSecondPct: barPct(r?.avgTokensPerSecond ?? 0, maxTps,),
    repetitionPct: barPct(r?.avgRepetitionRate ?? 0, maxRep,),
  }));
}

/** Project per-model quality rows into CSS-bar friendly series. */
function projectQualityModels(
  rows: QualityModelRow[] | undefined,
): (QualityModelRow & { latencyPct: number; tokensPerSecondPct: number })[] {
  const models = Array.isArray(rows,) ? rows : [];
  const maxLatency = Math.max(1, ...models.map((m,) => m?.avgLatencyMs ?? 0),);
  const maxTps = Math.max(1, ...models.map((m,) => m?.avgTokensPerSecond ?? 0),);
  return models.map((m,) => ({
    ...m,
    latencyPct: barPct(m?.avgLatencyMs ?? 0, maxLatency,),
    tokensPerSecondPct: barPct(m?.avgTokensPerSecond ?? 0, maxTps,),
  }));
}

/** Project finish reasons into CSS-bar friendly series. */
function projectFinishReasons(
  rows: { reason: string; count: number }[] | undefined,
): { reason: string; count: number; pct: number }[] {
  const reasons = Array.isArray(rows,) ? rows : [];
  const max = Math.max(1, ...reasons.map((r,) => r?.count ?? 0),);
  return reasons.map((r,) => ({
    reason: r?.reason ?? "",
    count: r?.count ?? 0,
    pct: barPct(r?.count ?? 0, max,),
  }));
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
  analyticsDailyBars: [] as { date: string; count: number; pct: number }[],
  analyticsLatencyBars: [] as { label: string; count: number; pct: number }[],
  analyticsRoleSegments: [] as { role: string; label: string; tokens: number; color: string; pct: number }[],
  analyticsQualityTotals: null as QualityTotals | null,
  analyticsQualityTrend:
    [] as (QualityTrendRow & { latencyPct: number; tokensPerSecondPct: number; repetitionPct: number })[],
  analyticsQualityModels: [] as (QualityModelRow & { latencyPct: number; tokensPerSecondPct: number })[],
  analyticsQualityFinishReasons: [] as { reason: string; count: number; pct: number }[],
  loadingAnalytics: false,
  purgingAnalytics: false,

  async loadAnalytics() {
    this.loadingAnalytics = true;
    try {
      const [summaryRes, dailyRes, errorsRes, conversationRes, charactersRes, qualityRes,] = await Promise.allSettled([
        apiFetch("/api/v1/telemetry/analytics/summary", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/telemetry/analytics/daily?limit=30", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/telemetry/analytics/errors", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/analytics/overview", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/analytics/characters", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/v1/analytics/quality", { headers: { Accept: "application/json", }, },),
      ],);

      if (
        summaryRes.status !== "fulfilled" || dailyRes.status !== "fulfilled" || errorsRes.status !== "fulfilled" ||
        conversationRes.status !== "fulfilled" || charactersRes.status !== "fulfilled"
      ) {
        throw new Error("analytics load failed",);
      }

      if (summaryRes.value.ok) { this.analyticsSummary = await summaryRes.value.json(); }
      if (dailyRes.value.ok) {
        const daily = await dailyRes.value.json();
        this.dailyStats = Array.isArray(daily,) ? daily : [];
      }

      if (errorsRes.value.ok) {
        const errors = await errorsRes.value.json();
        this.errorEvents = Array.isArray(errors,) ? errors : [];
      }

      if (conversationRes.value.ok) {
        const overview = await conversationRes.value.json() as ConversationOverview;
        this.conversationOverview = overview;
        const roles = {
          user: overview.tokensByRole?.user ?? 0,
          assistant: overview.tokensByRole?.assistant ?? 0,
          system: overview.tokensByRole?.system ?? 0,
        };

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

        const maxDaily = Math.max(1, ...this.dailyStats.map((d,) => d?.count ?? 0),);
        this.analyticsDailyBars = this.dailyStats.map((d,) => ({
          date: d?.date ?? "",
          count: d?.count ?? 0,
          pct: Math.round((d?.count ?? 0) / maxDaily * 100,),
        }));

        const buckets = Array.isArray(overview.latencyBuckets,) ? overview.latencyBuckets : [];
        const maxLatency = Math.max(1, ...buckets.map((b,) => b?.count ?? 0),);
        this.analyticsLatencyBars = buckets.map((b,) => ({
          label: b?.label ?? "",
          count: b?.count ?? 0,
          pct: Math.round((b?.count ?? 0) / maxLatency * 100,),
        }));
      }

      if (charactersRes.value.ok) {
        const chars = await charactersRes.value.json() as { characters?: CharacterStat[] };
        this.analyticsCharacters = Array.isArray(chars?.characters,) ? chars.characters : [];
      }

      // Quality metrics are optional: a failure here must not break the panel or toast.
      // Reset first so a failed refresh never leaves stale numbers on screen.
      this.analyticsQualityTotals = null;
      this.analyticsQualityTrend = [];
      this.analyticsQualityModels = [];
      this.analyticsQualityFinishReasons = [];
      if (qualityRes.status === "fulfilled" && qualityRes.value.ok) {
        try {
          const quality = await qualityRes.value.json() as QualityResponse;
          this.analyticsQualityTotals = quality?.totals ?? null;
          this.analyticsQualityTrend = projectQualityTrend(quality?.trend,);
          this.analyticsQualityModels = projectQualityModels(quality?.byModel,);
          this.analyticsQualityFinishReasons = projectFinishReasons(quality?.finishReasons,);
        } catch {
          // Malformed body — leave the quality panel empty instead of toasting.
        }
      }
    } catch {
      showToast("error", t("toasts.failedLoadAnalytics",),);
    } finally {
      this.loadingAnalytics = false;
    }
  },

  async purgeAnalytics() {
    if (this.purgingAnalytics) { return; }
    this.purgingAnalytics = true;
    try {
      const res = await apiFetch("/api/v1/telemetry/analytics/purge?days=90", { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.telemetryPurged",),);
        await this.loadAnalytics();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast("error", (err as { message?: string })?.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.purgingAnalytics = false;
    }
  },
};
