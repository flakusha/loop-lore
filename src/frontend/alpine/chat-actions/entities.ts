// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend confirm handlers for the B4 entity actions: apply-entity,
 * add-entity, clone-entity, modify-entity, import-entity.
 *
 * Each handler calls the REAL backend route the preview documents, asks for
 * confirmation naming the ENTITY (not the id), and toasts through the shared
 * i18n keys. Nothing is persisted without the confirm dialog.
 */

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";
import { type DispatchCtx, } from "./generation-helpers";

const log = rootLog.child({ module: "chat-actions-entities", },);

export type EntityActionHandler = (
  ctx: DispatchCtx & Partial<ChatState>,
  payload: Record<string, unknown> | null,
  chatId: string,
) => Promise<void> | void;

export const entityActionHandlers: Record<string, EntityActionHandler> = {
  "apply-entity": async (ctx, payload,) => {
    const kind = (payload?.kind as string) ?? "";
    const entityId = (payload?.entityId as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    const contentVersion = payload?.contentVersion as number | undefined;
    // Characters live on the actor route and carry no world id; every other
    // kind is world-scoped.
    if (!kind || !entityId || (kind !== "character" && !worldId) || Object.keys(updates,).length === 0) {
      log.warn("apply-entity: missing required payload fields", { payload, },);
      return;
    }

    // Exactly the routes the backend preview documents per kind.
    const path = kind === "character"
      ? `/api/v1/actors/${entityId}`
      : kind === "world"
      ? `/api/v1/worlds/${worldId}`
      : kind === "location"
      ? `/api/v1/worlds/${worldId}/locations/${entityId}`
      : kind === "item"
      ? `/api/v1/worlds/${worldId}/items/${entityId}`
      : null;

    if (!path) {
      log.warn("apply-entity: unknown entity kind", { kind, },);
      return;
    }

    const label = name || entityId;
    if (!confirm(t("toasts.confirmApplyEntity", { name: label, },),)) { return; }
    try {
      const res = await apiFetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        // The actor route requires the optimistic-locking version; every other
        // route takes the patch as-is.
        body: jsonBody(kind === "character" ? { ...updates, contentVersion, } : updates,),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok
          ? t("toasts.entityApplied", { name: label, },)
          : t("toasts.failedApplyEntity", { name: label, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedApplyEntity", { name: label, },), },);
    }
  },

  "add-entity": async (ctx, payload,) => {
    const kind = (payload?.kind as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const fields = (payload?.fields ?? {}) as Record<string, unknown>;
    if (!kind || !worldId || !name) {
      log.warn("add-entity: missing required payload fields", { payload, },);
      return;
    }

    const path = kind === "location"
      ? `/api/v1/worlds/${worldId}/locations`
      : kind === "item"
      ? `/api/v1/worlds/${worldId}/items`
      : null;

    if (!path) {
      log.warn("add-entity: unknown entity kind", { kind, },);
      return;
    }

    if (!confirm(t("toasts.confirmAddEntity", { kind, name, },),)) { return; }
    try {
      const res = await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ name, ...fields, },),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok ? t("toasts.entityAdded", { name, },) : t("toasts.failedAddEntity", { name, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedAddEntity", { name, },), },);
    }
  },

  "clone-entity": async (ctx, payload,) => {
    const kind = (payload?.kind as string) ?? "";
    const sourceId = (payload?.sourceId as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const fields = (payload?.fields ?? {}) as Record<string, unknown>;
    if (!kind || !sourceId || !worldId || !name || Object.keys(fields,).length === 0) {
      log.warn("clone-entity: missing required payload fields", { payload, },);
      return;
    }

    // The create routes are the clone routes: the copied fields travel in the
    // POST body with the new name already applied.
    const path = kind === "location"
      ? `/api/v1/worlds/${worldId}/locations`
      : kind === "item"
      ? `/api/v1/worlds/${worldId}/items`
      : null;

    if (!path) {
      log.warn("clone-entity: unknown entity kind", { kind, },);
      return;
    }

    if (!confirm(t("toasts.confirmCloneEntity", { name, },),)) { return; }
    try {
      const res = await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(fields,),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok ? t("toasts.entityCloned", { name, },) : t("toasts.failedCloneEntity", { name, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedCloneEntity", { name, },), },);
    }
  },

  "modify-entity": async (ctx, payload,) => {
    const kind = (payload?.kind as string) ?? "";
    const entityId = (payload?.entityId as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    const contentVersion = payload?.contentVersion as number | undefined;
    if (!kind || !entityId || Object.keys(updates,).length === 0) {
      log.warn("modify-entity: missing required payload fields", { payload, },);
      return;
    }

    // The same routes the backend preview documents; characters live on the
    // actor route, which also requires the optimistic-locking version.
    const path = kind === "character"
      ? `/api/v1/actors/${entityId}`
      : kind === "world"
      ? `/api/v1/worlds/${worldId}`
      : kind === "location"
      ? `/api/v1/worlds/${worldId}/locations/${entityId}`
      : kind === "item"
      ? `/api/v1/worlds/${worldId}/items/${entityId}`
      : null;

    if (!path) {
      log.warn("modify-entity: unknown entity kind", { kind, },);
      return;
    }

    const label = name || entityId;
    if (!confirm(t("toasts.confirmModifyEntity", { name: label, },),)) { return; }
    try {
      const body = kind === "character" ? { ...updates, contentVersion, } : updates;
      const res = await apiFetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok
          ? t("toasts.entityModified", { name: label, },)
          : t("toasts.failedModifyEntity", { name: label, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedModifyEntity", { name: label, },), },);
    }
  },

  "import-entity": async (ctx, payload,) => {
    const assetId = (payload?.assetId as string) ?? "";
    const filename = (payload?.filename as string) ?? "character.json";
    const name = (payload?.name as string) ?? "";
    if (!assetId) {
      log.warn("import-entity: missing required payload fields", { payload, },);
      return;
    }

    const label = name || filename;
    if (!confirm(t("toasts.confirmImportEntity", { name: label, },),)) { return; }
    try {
      // The uploaded card travels to the EXISTING import route; the frontend
      // re-reads the bytes it owns and posts them as multipart form data.
      const raw = await apiFetch(`/api/v1/assets/${assetId}/raw`,);
      if (!raw.ok) {
        ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedImportEntity", { name: label, },), },);
        return;
      }

      const blob = await raw.blob();
      const form = new FormData();
      form.append("file", new File([blob,], filename,), filename,);
      const res = await apiFetch("/api/v1/actors/import", { method: "POST", body: form, },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok
          ? t("toasts.entityImported", { name: label, },)
          : t("toasts.failedImportEntity", { name: label, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedImportEntity", { name: label, },), },);
    }
  },
};
