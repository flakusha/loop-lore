// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Item command-action dispatch.
 *
 * The `item-transfer`, `item-drop` and `item-pickup` command actions apply the
 * move the assistant command previewed. All three call the same route:
 * POST /api/v1/worlds/:worldId/item-instances/:instanceId/transfer with a
 * `toLocationId` (drop, explicit transfer) and/or `toActorId` (pickup,
 * explicit transfer). Payloads come from the assistant command and carry
 * entity NAMES so the confirm dialog never shows a raw id.
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

/** Item mutation actions — previewed by the assistant, applied on confirm. */
export const itemActionHandlers: Record<string, ActionHandler> = {
  "item-transfer": async (ctx, payload,) => {
    const worldId = (payload?.worldId as string) ?? "";
    const instanceId = (payload?.instanceId as string) ?? "";
    const itemName = (payload?.itemName as string) ?? "";
    const toName = (payload?.toName as string) ?? "";
    const toLocationId = (payload?.toLocationId as string) ?? "";
    const toActorId = (payload?.toActorId as string) ?? "";
    const quantity = (payload?.quantity as number) ?? 1;
    if (!worldId || !instanceId || (!toLocationId && !toActorId)) {
      log.warn("item-transfer: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Move "${itemName || instanceId}" to "${toName || (toActorId || toLocationId)}"?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/item-instances/${instanceId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ quantity, ...(toLocationId ? { toLocationId, } : { toActorId, }), },),
      },);

      // The route answers 200 with { success: false } when the transfer itself
      // fails (e.g. the source row vanished between preview and confirm).
      let body: unknown = null;
      try {
        body = await res.json();
      } catch { /* non-JSON 2xx counts as success */ }

      const failed = !res.ok ||
        (typeof body === "object" && body !== null && "success" in body && body.success === false);

      ctx.$dispatch?.("show-toast", {
        type: !failed ? "success" : "error",
        message: !failed ? t("toasts.itemTransferred",) : t("toasts.failedItemTransfer",),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedItemTransfer",), },);
    }
  },

  "item-drop": async (ctx, payload,) => {
    const worldId = (payload?.worldId as string) ?? "";
    const instanceId = (payload?.instanceId as string) ?? "";
    const itemName = (payload?.itemName as string) ?? "";
    const toLocationId = (payload?.toLocationId as string) ?? "";
    const toName = (payload?.toName as string) ?? "";
    const quantity = (payload?.quantity as number) ?? 1;
    if (!worldId || !instanceId || !toLocationId) {
      log.warn("item-drop: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Drop "${itemName || instanceId}" here ("${toName || toLocationId}")?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/item-instances/${instanceId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ quantity, toLocationId, },),
      },);

      let body: unknown = null;
      try {
        body = await res.json();
      } catch { /* non-JSON 2xx counts as success */ }

      const failed = !res.ok ||
        (typeof body === "object" && body !== null && "success" in body && body.success === false);

      ctx.$dispatch?.("show-toast", {
        type: !failed ? "success" : "error",
        message: !failed ? t("toasts.itemDropped",) : t("toasts.failedItemDrop",),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedItemDrop",), },);
    }
  },

  "item-pickup": async (ctx, payload,) => {
    const worldId = (payload?.worldId as string) ?? "";
    const instanceId = (payload?.instanceId as string) ?? "";
    const itemName = (payload?.itemName as string) ?? "";
    const toActorId = (payload?.toActorId as string) ?? "";
    const toName = (payload?.toName as string) ?? "";
    const quantity = (payload?.quantity as number) ?? 1;
    if (!worldId || !instanceId || !toActorId) {
      log.warn("item-pickup: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Pick up "${itemName || instanceId}" as "${toName || toActorId}"?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/item-instances/${instanceId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ quantity, toActorId, },),
      },);

      let body: unknown = null;
      try {
        body = await res.json();
      } catch { /* non-JSON 2xx counts as success */ }

      const failed = !res.ok ||
        (typeof body === "object" && body !== null && "success" in body && body.success === false);

      ctx.$dispatch?.("show-toast", {
        type: !failed ? "success" : "error",
        message: !failed ? t("toasts.itemPickedUp",) : t("toasts.failedItemPickup",),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedItemPickup",), },);
    }
  },
};
