// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-client generation busy state, read from the caller-scoped
 * GET /api/v1/generation/active/me route.
 */
import { apiFetch, } from "./htmx";

/** Busy fields an Alpine root needs to display the shared active count. */
export interface GenerationBusyState {
  /** Active generation count for the authenticated caller. */
  activeCount: number;
  /** Surfaced when the per-user count cannot be read. */
  activeError: string;
  /** Read the caller's count into this root's busy fields. */
  refreshActive(): Promise<void>;
}

/** Mixin spread into Alpine roots that host the busy indicator. */
export const generationBusyState: GenerationBusyState = {
  activeCount: 0,
  activeError: "",

  async refreshActive(): Promise<void> {
    try {
      const res = await apiFetch("/api/v1/generation/active/me",);
      if (!res.ok) {
        this.activeCount = 0;
        this.activeError = `Generation activity unavailable (${res.status})`;
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
