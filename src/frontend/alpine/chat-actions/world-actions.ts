// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World command-action dispatch.
 *
 * The `world-update` and `world-delete` command actions apply the change the
 * assistant command previewed: PUT /api/v1/worlds/:worldId for an update and
 * DELETE /api/v1/worlds/:worldId for a delete, each behind a confirm dialog.
 *
 * Kept apart from `dispatch.ts` (the general chat-action router) so each file
 * stays under 250L.
 */

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";

import type { ActionHandler, } from "./dispatch";

const log = rootLog.child({ module: "chat-actions", },);

/** World mutation actions — previewed by the assistant, applied on confirm. */
export const worldActionHandlers: Record<string, ActionHandler> = {
  "world-update": async (ctx, payload,) => {
    const worldId = (payload?.worldId as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    if (!worldId || Object.keys(updates,).length === 0) {
      log.warn("world-update: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Apply the pending update to world "${worldId}"?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(updates,),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok ? t("toasts.worldSaved",) : t("toasts.failedSaveWorld",),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedSaveWorld",), },);
    }
  },

  "world-delete": async (ctx, payload,) => {
    const worldId = (payload?.worldId as string) ?? "";
    if (!worldId) {
      log.warn("world-delete: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Permanently delete world "${worldId}"?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}`, { method: "DELETE", },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok ? t("toasts.worldDeleted",) : t("toasts.failedDeleteWorld",),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedDeleteWorld",), },);
    }
  },
};
