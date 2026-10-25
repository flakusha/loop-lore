// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";
import { battleActionHandlers, } from "./battle";
import { entityActionHandlers, } from "./entities";
import { type DispatchCtx, dispatchGenerationAction, dispatchQuestAction, } from "./generation-helpers";
import { itemActionHandlers, } from "./item-actions";
import { wizardActionHandlers, } from "./wizard";

const log = rootLog.child({ module: "chat-actions", },);

export const dispatch: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Dispatch a command action returned by the backend.
   *
   * Maps action strings to the appropriate API endpoint and fires the request.
   * Generation actions connect SSE for real-time progress streaming.
   * @param action - Action identifier from CommandResult.action
   * @param payload - Action payload from CommandResult.actionPayload
   * @param chatId - Active chat ID
   */
  async dispatchCommandAction(action: string, payload: Record<string, unknown> | null, chatId: string,) {
    log.info("dispatchCommandAction", { action, chatId, },);

    const handler = actionHandlers[action];
    if (handler) {
      await handler(this, payload, chatId,);
      return;
    }

    // Check unimplemented generation actions
    if (["generate-music", "generate-sfx", "generate-video",].includes(action,)) {
      const label = action.replace("generate-", "",);
      this.$dispatch?.("show-toast", {
        type: "info",
        message: t("toasts.actionNotImplemented", { label, },),
      },);

      log.info("Unimplemented generation action", { action, },);
      return;
    }

    log.warn("Unknown command action", { action, },);
    this.$dispatch?.("show-toast", {
      type: "warning",
      message: t("toasts.unknownAction", { action, },),
    },);
  },
};

// ── Action handlers (extracted for cognitive complexity) ──────

export type ActionHandler = (
  ctx: DispatchCtx & Partial<ChatState>,
  payload: Record<string, unknown> | null,
  chatId: string,
) => Promise<void> | void;

const actionHandlers: Record<string, ActionHandler> = {
  ...battleActionHandlers,
  ...itemActionHandlers,
  ...entityActionHandlers,
  ...wizardActionHandlers,

  "generate-image": async (ctx, payload, chatId,) => {
    await dispatchGenerationAction(
      ctx,
      "/api/v1/generation/image",
      { prompt: (payload?.prompt as string) ?? "", chatId, },
      "Image generation",
      chatId,
    );
  },

  "generate-caption": async (ctx, payload, chatId,) => {
    const assetIds = (payload?.assetIds as string[]) ?? [];
    if (assetIds.length === 0) {
      ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noAssetsToCaption",), },);
      return;
    }

    await dispatchGenerationAction(
      ctx,
      "/api/v1/generation/caption",
      { chatId, assetIds, },
      "Captioning",
      chatId,
    );
  },

  "link-asset": async (ctx, payload,) => {
    const assetId = (payload?.assetId as string) ?? "";
    const entityType = (payload?.entityType as string) ?? "";
    const entityId = (payload?.entityId as string) ?? "";
    const filename = (payload?.filename as string) ?? assetId;
    if (!assetId || !entityType || !entityId) {
      log.warn("link-asset: missing required payload fields", { payload, },);
      return;
    }

    const target = entityType === "message" ? `message ${entityId}` : "this chat";
    if (!confirm(`Attach "${filename}" to ${target}?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/assets/${assetId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ entityType, entityId, },),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok
          ? t("toasts.assetLinked", { filename, },)
          : t("toasts.assetLinkFailed", { filename, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.assetLinkFailed", { filename, },), },);
    }
  },




  "loc-update": async (ctx, payload,) => {
    const locId = (payload?.locId as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    if (!locId || !worldId || Object.keys(updates,).length === 0) {
      log.warn("loc-update: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Apply the pending update to location "${name || locId}"?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(updates,),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok ? t("toasts.locationUpdated",) : t("toasts.failedUpdateLocation",),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedUpdateLocation",), },);
    }
  },

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







  "apply-entity": async (ctx, payload,) => {
    const kind = (payload?.kind as string) ?? "";
    const entityId = (payload?.entityId as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    if (!kind || !entityId || !worldId || Object.keys(updates,).length === 0) {
      log.warn("apply-entity: missing required payload fields", { payload, },);
      return;
    }

    // Exactly the routes the backend preview documents per kind.
    const path = kind === "world"
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
        body: jsonBody(updates,),
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


  "apply-entity": async (ctx, payload,) => {
    const kind = (payload?.kind as string) ?? "";
    const entityId = (payload?.entityId as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    if (!kind || !entityId || !worldId || Object.keys(updates,).length === 0) {
      log.warn("apply-entity: missing required payload fields", { payload, },);
      return;
    }

    // Exactly the routes the backend preview documents per kind.
    const path = kind === "world"
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
        body: jsonBody(updates,),
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

  "impersonate-toggle": async (ctx, payload, chatId,) => {
    const mode = (payload?.mode as string) ?? "toggle";
    if (mode === "off") {
      await apiFetch(`/api/v1/chats/${chatId}/impersonate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ impersonateActorId: null, },),
      },);

      ctx.impersonationActive = false;
      ctx.impersonatingActorId = null;
      ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.impersonationEnded",), },);
    } else {
      await (ctx as { toggleImpersonate(): Promise<void> }).toggleImpersonate();
    }
  },

  "impersonate-select": async (ctx, payload, chatId,) => {
    const characterName = (payload?.characterName as string) ?? "";
    if (!characterName) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/participants`, {
        headers: { Accept: "application/json", },
      },);

      if (!res.ok) { return; }
      const participants = await res.json();
      const target = participants.find(
        (p: { display_name?: string; actor_type?: string },) =>
          p.actor_type === "character" &&
          p.display_name?.toLowerCase() === characterName.toLowerCase(),
      );

      if (!target) {
        ctx.$dispatch?.("show-toast", {
          type: "warning",
          message: t("toasts.characterNotFound", { name: characterName, },),
        },);

        return;
      }

      const putRes = await apiFetch(`/api/v1/chats/${chatId}/impersonate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ impersonateActorId: target.actor_id, },),
      },);

      if (putRes.ok) {
        ctx.impersonationActive = true;
        ctx.impersonatingActorId = target.actor_id;
        ctx.$dispatch?.("show-toast", {
          type: "info",
          message: t("toasts.playingAs", { name: target.display_name || characterName, },),
        },);
      } else {
        const err = await putRes.json();
        ctx.$dispatch?.("show-toast", {
          type: "error",
          message: err.error || t("toasts.failedStartImpersonation",),
        },);
      }
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorResolvingCharacter",), },);
    }
  },

  "char-update": async (ctx, payload,) => {
    const charId = (payload?.charId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    const contentVersion = payload?.contentVersion as number | undefined;
    if (!charId || Object.keys(updates,).length === 0 || contentVersion === undefined) {
      log.warn("char-update: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Apply the pending update to character "${name || charId}"?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/actors/${charId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ...updates, contentVersion, },),
      },);

      let failed = !res.ok;
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        failed = body?.ok === false;
      }

      ctx.$dispatch?.("show-toast", {
        type: failed ? "error" : "success",
        message: failed ? t("toasts.failedUpdateCharacter",) : t("toasts.characterUpdated", { name, },),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedUpdateCharacter",), },);
    }
  },

  "item-update": async (ctx, payload,) => {
    const itemId = (payload?.itemId as string) ?? "";
    const worldId = (payload?.worldId as string) ?? "";
    const name = (payload?.name as string) ?? "";
    const updates = (payload?.updates ?? {}) as Record<string, unknown>;
    if (!itemId || !worldId || Object.keys(updates,).length === 0) {
      log.warn("item-update: missing required payload fields", { payload, },);
      return;
    }

    if (!confirm(`Apply the pending update to item "${name || itemId}"?`,)) { return; }
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(updates,),
      },);

      ctx.$dispatch?.("show-toast", {
        type: res.ok ? "success" : "error",
        message: res.ok ? t("toasts.itemUpdated",) : t("toasts.failedUpdateItem",),
      },);
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedUpdateItem",), },);
    }
  },

  "create-quest": async (ctx, payload, chatId,) => {
    await dispatchQuestAction(ctx, (payload?.description as string) ?? "", chatId,);
  },

  "review-entity": (_ctx, payload,) => {
    log.info("review-entity action — display only", { payload, },);
  },
};
