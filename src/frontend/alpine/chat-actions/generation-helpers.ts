// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation / quest command-action API helpers.
 *
 * `dispatchGenerationAction` posts a generation request and wires SSE;
 * `dispatchQuestAction` creates a quest for the active chat's world. Kept
 * apart from `dispatch.ts` (the action router) so each file stays < 250L.
 */

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";

/** Context shape needed by command action dispatch helpers. */
export interface DispatchCtx {
  $dispatch?: (event: string, detail: Record<string, unknown>,) => void;
  connectGenerationSSE: (chatId: string,) => void;
}

/** Handle 501 / error / success for generation-type command actions. */
export async function dispatchGenerationAction(
  ctx: DispatchCtx,
  endpoint: string,
  body: Record<string, unknown>,
  label: string,
  chatId: string,
) {
  const prompt = (body.prompt as string) ?? "";
  if (!prompt && !body.assetIds) {
    ctx.$dispatch?.("show-toast", {
      type: "warning",
      message: t("toasts.actionNoInput", { action: label.toLowerCase(), },),
    },);
    return;
  }
  try {
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(body,),
    },);
    if (res.ok) {
      ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.actionStarted", { action: label, },), },);
      ctx.connectGenerationSSE(chatId,);
    } else if (res.status === 501) {
      ctx.$dispatch?.("show-toast", {
        type: "info",
        message: t("toasts.actionNotConfigured", { action: label, },),
      },);
    } else {
      const err = await res.json();
      ctx.$dispatch?.("show-toast", {
        type: "error",
        message: err.error || t("toasts.actionFailed", { action: label.toLowerCase(), },),
      },);
    }
  } catch {
    ctx.$dispatch?.("show-toast", {
      type: "error",
      message: t("toasts.actionNetworkError", { action: label.toLowerCase(), },),
    },);
  }
}

/** Dispatch create-quest command action. */
export async function dispatchQuestAction(ctx: DispatchCtx, description: string, chatId: string,) {
  if (!description) {
    ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noQuestDescription",), },);
    return;
  }
  try {
    // Fetch chat to get world_id (backend requires /api/worlds/:worldId/quests)
    const chatRes = await apiFetch(`/api/v1/chats/${chatId}`,);
    if (!chatRes.ok) {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedLoadChatForQuest",), },);
      return;
    }
    const chat = await chatRes.json();
    const worldId = chat.world_id;
    if (!worldId) {
      ctx.$dispatch?.("show-toast", {
        type: "warning",
        message: t("toasts.questsRequireWorld",),
      },);
      return;
    }
    const res = await apiFetch(`/api/worlds/${worldId}/quests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ chatId, description, },),
    },);
    if (res.ok) {
      ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.questCreated",), },);
    } else {
      const err = await res.json();
      ctx.$dispatch?.("show-toast", {
        type: "error",
        message: err.error || t("toasts.failedCreateQuest",),
      },);
    }
  } catch {
    ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorCreatingQuest",), },);
  }
}
