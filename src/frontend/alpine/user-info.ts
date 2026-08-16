// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sidebar user info — populates #user-display-name and #user-role in the
 * shared layout sidebar from GET /api/auth/me. Runs on every page; the layout
 * ships with hardcoded "User"/"solo" placeholders that chat.ts never updates
 * (it only stores user info in Alpine state).
 */

import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "user-info", },);

async function loadUserInfo(): Promise<void> {
  const nameEl = document.querySelector("#user-display-name",);
  const roleEl = document.querySelector("#user-role",);
  if (!nameEl && !roleEl) { return; }

  try {
    const res = await apiFetch("/api/auth/me",);
    if (!res.ok) { return; }
    const user = (await res.json()) as {
      display_name?: string;
      username?: string;
      role?: string;
    };
    if (nameEl) { nameEl.textContent = user.display_name || user.username || t("common.user",); }
    if (roleEl) { roleEl.textContent = user.role || "solo"; }
  } catch {
    log.debug("loadUserInfo failed — keeping placeholder",);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void loadUserInfo();
},);
