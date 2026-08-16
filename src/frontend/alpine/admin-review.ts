// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Admin Review tab (admin.html) — content flag review queue ──

import { jsonBody, } from "./json";

interface FlagRow {
  id: string;
  reporterId: string;
  contentType: string;
  contentId: string;
  chatId: string | null;
  worldId: string | null;
  flagReason: string;
  description: string | null;
  status: string;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export const adminReview = {
  reviewFlags: [] as FlagRow[],
  reviewTotal: 0,
  reviewStatus: "pending",
  reviewStats: {
    pending: 0,
    total: 0,
    dismissed: 0,
    resolved: 0,
    falsePositiveRate: 0,
    daily: [] as { date: string; count: number }[],
    topContentTypes: [] as { contentType: string; count: number }[],
  },
  loadingReview: false,
  reviewResolution: {} as Record<string, string>,

  async loadReview() {
    this.loadingReview = true;
    try {
      const [queueRes, statsRes,] = await Promise.allSettled([
        apiFetch(`/api/nsfw/moderation/flags?status=${this.reviewStatus}&limit=50`, {
          headers: { Accept: "application/json", },
        },),
        apiFetch("/api/admin/review/stats", { headers: { Accept: "application/json", }, },),
      ],);
      if (queueRes.status === "fulfilled" && queueRes.value.ok) {
        const d = await queueRes.value.json();
        this.reviewFlags = d.data?.flags || [];
        this.reviewTotal = d.data?.total || 0;
      }
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        this.reviewStats = await statsRes.value.json();
      }
    } catch {
      /* ignore */
    } finally {
      this.loadingReview = false;
    }
  },

  async resolveFlag(flagId: string, status: "resolved" | "dismissed" | "upheld",) {
    try {
      const res = await apiFetch(`/api/nsfw/moderation/flags/${flagId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          resolvedBy: (globalThis as any).currentUserId || "admin",
          resolution: this.reviewResolution[flagId] || status,
          status,
        },),
      },);
      if (res.ok) {
        showToast("success", "Flag resolved",);
        this.reviewResolution[flagId] = "";
        this.loadReview();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed to resolve flag",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },
};
