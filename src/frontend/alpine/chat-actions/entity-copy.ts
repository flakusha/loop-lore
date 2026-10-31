// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend confirm handlers for the B5 copy/adapt actions: duplicate-entity
 * and adapt-entity. Both confirm with the user, then post the previewed
 * fields to the create-entity confirm route, which re-validates the draft
 * server-side (normalizeEntity + validateEntitySchema + world ownership)
 * before insertGeneratedEntity persists it.
 */

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";
import { type DispatchCtx, } from "./generation-helpers";

const log = rootLog.child({ module: "chat-actions-entity-copy", },);

export type EntityCopyActionHandler = (
  ctx: DispatchCtx & Partial<ChatState>,
  payload: Record<string, unknown> | null,
  chatId: string,
) => Promise<void> | void;

export const entityCopyActionHandlers: Record<string, EntityCopyActionHandler> = {
  "duplicate-entity": async (ctx, payload, chatId,) => {
    const kind = (payload?.kind as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const worldId = (payload?.worldId as string | null) ?? null;
    const fields = (payload?.fields ?? {}) as Record<string, unknown>;
    if (!kind || !name || Object.keys(fields,).length === 0 || !chatId) {
      log.warn("duplicate-entity: missing required payload fields", { payload, },);
      return;
    }

    // The confirm route re-validates the copied+overridden fields server-side
    // (normalizeEntity + validateEntitySchema) before insertGeneratedEntity.
    if (!confirm(t("toasts.confirmDuplicateEntity", { name, },),)) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/create-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ kind, data: fields, worldId, },),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok ? t("toasts.entityDuplicated", { name, },) : t("toasts.failedDuplicateEntity", { name, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedDuplicateEntity", { name, },), },);
    }
  },

  "adapt-entity": async (ctx, payload, chatId,) => {
    const kind = (payload?.kind as string) ?? "";
    const sourceName = (payload?.sourceName as string) ?? "";
    const targetWorldId = (payload?.targetWorldId as string) ?? "";
    const fields = (payload?.fields ?? {}) as Record<string, unknown>;
    if (!kind || !sourceName || !targetWorldId || Object.keys(fields,).length === 0 || !chatId) {
      log.warn("adapt-entity: missing required payload fields", { payload, },);
      return;
    }

    // The confirm route re-validates the adapted draft server-side before
    // insertGeneratedEntity attributes it to the confirming caller in the
    // TARGET world (world ownership is re-checked there).
    if (!confirm(t("toasts.confirmAdaptEntity", { name: sourceName, },),)) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/create-entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ kind, data: fields, worldId: targetWorldId, },),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok
          ? t("toasts.entityAdapted", { name: sourceName, },)
          : t("toasts.failedAdaptEntity", { name: sourceName, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", {
        type: "error",
        message: t("toasts.failedAdaptEntity", { name: sourceName, },),
      },);
    }
  },
};
