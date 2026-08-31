// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";
import { battleActionHandlers, } from "./battle";
import { type DispatchCtx, dispatchGenerationAction, dispatchQuestAction, } from "./generation-helpers";
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

type ActionHandler = (
  ctx: DispatchCtx & Partial<ChatState>,
  payload: Record<string, unknown> | null,
  chatId: string,
) => Promise<void> | void;

const actionHandlers: Record<string, ActionHandler> = {
  ...battleActionHandlers,
  ...wizardActionHandlers,

  "generate-image": async (ctx, payload, chatId,) => {
    await dispatchGenerationAction(
      ctx,
      "/api/generation/image",
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
      "/api/generation/caption",
      { chatId, assetIds, },
      "Captioning",
      chatId,
    );
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

  "create-quest": async (ctx, payload, chatId,) => {
    await dispatchQuestAction(ctx, (payload?.description as string) ?? "", chatId,);
  },

  "review-entity": (_ctx, payload,) => {
    log.info("review-entity action — display only", { payload, },);
  },
};
