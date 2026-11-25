// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-client generation busy state, read from the existing
 * GET /api/v1/generation/active aggregate. No new backend route.
 */
import { apiFetch, } from "./htmx";

/** Busy fields an Alpine root needs to display the shared active count. */
export interface GenerationBusyState {
  /** Active generation count reported by the aggregate. */
  activeCount: number;
  /** Surfaced when the aggregate cannot be read. */
  activeError: string;
  /** Read the aggregate into this root's busy fields. */
  refreshActive(): Promise<void>;
}

/** Mixin spread into Alpine roots that host the busy indicator. */
export const generationBusyState: GenerationBusyState = {
  activeCount: 0,
  activeError: "",

  async refreshActive(): Promise<void> {
    try {
      const res = await apiFetch("/api/v1/generation/active",);
      if (!res.ok) {
        // The aggregate is admin-only: non-admins have no visibility, not a
        // failure worth an error badge. Other codes are surfaced.
        this.activeError = res.status === 403 ? "" : `Generation activity unavailable (${res.status})`;
        if (res.status !== 403) { this.activeCount = 0; }
        return;
      }

      const payload = await res.json() as { count?: unknown };
      this.activeCount = typeof payload.count === "number" ? payload.count : 0;
      this.activeError = "";
    } catch {
      this.activeCount = 0;
      this.activeError = "Generation activity unavailable";
    }
  },
};
