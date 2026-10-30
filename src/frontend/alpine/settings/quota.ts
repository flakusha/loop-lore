// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { SettingsState, } from "./types";

const log = rootLog.child({ module: "settings-quota", },);

export interface QuotaGaugeDimension {
  key: string;
  used: number;
  ceiling: number | null;
}

export interface QuotaGaugeResource {
  id: string;
  provider: string;
  type: string;
  status: string;
  overQuota: boolean;
  dimensions: QuotaGaugeDimension[];
}

/**
 * 0..1 fraction of a ceiling consumed; unlimited (null/0) reads as 0.
 * @param used
 * @param ceiling
 * @returns consumed fraction, clamped to [0, 1]
 */
export function quotaPercentUsed(used: number, ceiling: number | null,): number {
  if (ceiling === null || ceiling <= 0) { return 0; }
  return Math.min(1, Math.max(0, used / ceiling,),);
}

/**
 * Whether a gauge dimension is exhausted (used meets the ceiling).
 * @param used
 * @param ceiling
 * @returns true when the ceiling is set and spent
 */
export function isQuotaExhausted(used: number, ceiling: number | null,): boolean {
  return ceiling !== null && ceiling > 0 && used >= ceiling;
}

/**
 * Settings quota-gauge submodule: per-resource usage vs ceiling, exhaustion
 * notice with fallback note, admin override (reset). Mirrors the api.ts
 * mixin shape; `init()` in general.ts awaits `loadQuotaState()`.
 * @returns {Partial<SettingsState> & ThisType<SettingsState>}
 */
export function quota(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    /**
     * Fetch per-resource quota state for the gauge.
     * @returns {Promise<void>}
     */
    async loadQuotaState() {
      try {
        const res = await apiFetch("/api/v1/generation/quota-state", { headers: { Accept: "application/json", }, },);
        if (!res.ok) { return; }
        const data = await res.json() as { resources?: QuotaGaugeResource[]; isAdmin?: boolean };
        this.quotaResources = data.resources ?? [];
        this.quotaIsAdmin = data.isAdmin === true;
        this.quotaNotice = this.quotaResources.some((r,) => r.overQuota)
          ? "quotaExhausted"
          : "";
      } catch (error) {
        log.warn("loadQuotaState failed", { error: String(error,), },);
      }
    },

    /**
     * 0..100 percent of a ceiling consumed (template calls this per bar).
     * @param used
     * @param ceiling
     * @returns percent consumed
     */
    quotaPercent(used: number, ceiling: number | null,): number {
      return Math.round(quotaPercentUsed(used, ceiling,) * 100,);
    },

    /**
     * Map a QuotaExceededError-shaped rejection onto the exhaustion notice
     * (fallback note explains the request queued behind failover/offline).
     * @param error
     * @returns {void}
     */
    notifyQuotaExceeded(error: { name?: string; kind?: string; limit?: number },): void {
      if (error?.name !== "QuotaExceededError") { return; }
      this.quotaNotice = "quotaExhausted";
      log.warn("quota exhausted", { kind: String(error.kind ?? "",), limit: Number(error.limit ?? 0,), },);
    },

    /**
     * Admin-only: reset one resource's window counters, then reload.
     * The template hides the button for non-admins; the route re-checks.
     * @param resourceId
     * @returns {Promise<void>}
     */
    async overrideQuota(resourceId: string,): Promise<void> {
      if (!this.quotaIsAdmin) { return; }
      try {
        const res = await apiFetch("/api/v1/generation/quota/override", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ resourceId, },),
        },);

        if (res.ok) { await this.loadQuotaState(); }
      } catch (error) {
        log.warn("overrideQuota failed", { error: String(error,), },);
      }
    },
  };
}
