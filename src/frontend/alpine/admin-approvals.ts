// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Admin Approvals tab (admin.html) — character approval queue ──

import { showToast, } from "../ui";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";

interface PendingReviewRow {
  id: string;
  display_name: string;
  owner_id: string | null;
  review_state: string;
  created_at: string;
}

export const adminApprovals = {
  pendingReviews: [] as PendingReviewRow[],
  loadingApprovals: false,
  rejectionReasons: {} as Record<string, string>,

  /**
   * @returns {Promise<void>}
   */
  async loadApprovals() {
    this.loadingApprovals = true;
    try {
      const res = await apiFetch("/api/v1/characters/pending-reviews", {
        headers: { Accept: "application/json", },
      },);

      if (res.ok) {
        const d = await res.json();
        this.pendingReviews = d.data || [];
      }
    } catch {
      /* ignore */
    } finally {
      this.loadingApprovals = false;
    }
  },

  /**
   * @param {string} actorId
   * @returns {Promise<void>}
   */
  async approveCharacter(actorId: string,) {
    try {
      const res = await apiFetch(`/api/v1/characters/${actorId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({},),
      },);

      if (res.ok) {
        showToast("success", "Character approved",);
        this.rejectionReasons[actorId] = "";
        this.loadApprovals();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed to approve",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },

  /**
   * @param {string} actorId
   * @param {string} reason
   * @returns {Promise<void>}
   */
  async rejectCharacter(actorId: string, reason: string,) {
    try {
      const res = await apiFetch(`/api/v1/characters/${actorId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ reason, },),
      },);

      if (res.ok) {
        showToast("success", "Character rejected",);
        this.rejectionReasons[actorId] = "";
        this.loadApprovals();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed to reject",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },
};
