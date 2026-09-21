// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { log as rootLog, } from "../logger";
import type { SettingsState, } from "./types";

const log = rootLog.child({ module: "settings-restart", },);

/**
 * Restart-needed notice for the /settings page. Non-admins get 403; banner hides.
 * @returns Banner state plus load/dismiss methods bound by the host.
 */
export function restartBanner(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    pendingRestartKeys: [] as string[],
    pendingRestartBannerDismissed: false,

    async loadPendingRestart() {
      try {
        const res = await apiFetch("/api/v1/admin/system-config", {
          headers: { Accept: "application/json", },
        },);
        if (!res.ok) { return; }
        const rows = await res.json() as { key: string; requires_restart?: boolean }[];
        this.pendingRestartKeys = rows
          .filter((r,) => r.requires_restart === true)
          .map((r,) => r.key);
      } catch (error) {
        log.warn("loadPendingRestart failed", { err: (error as Error).message, },);
      }
    },

    hasPendingRestart(): boolean {
      return !this.pendingRestartBannerDismissed && this.pendingRestartKeys.length > 0;
    },

    dismissRestartBanner() {
      this.pendingRestartBannerDismissed = true;
    },
  };
}
