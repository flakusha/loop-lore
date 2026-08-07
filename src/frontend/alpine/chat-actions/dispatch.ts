import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat-actions", },);

/** Context shape needed by command action dispatch helpers. */
interface DispatchCtx {
  $dispatch?: (event: string, detail: Record<string, unknown>,) => void;
  connectGenerationSSE: (chatId: string,) => void;
}

/** Handle 501 / error / success for generation-type command actions. */
async function dispatchGenerationAction(
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
async function dispatchQuestAction(ctx: DispatchCtx, description: string, chatId: string,) {
  if (!description) {
    ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noQuestDescription",), },);
    return;
  }
  try {
    // Fetch chat to get world_id (backend requires /api/worlds/:worldId/quests)
    const chatRes = await apiFetch(`/api/chats/${chatId}`,);
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

export const dispatch: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Dispatch a command action returned by the backend.
   *
   * Maps action strings to the appropriate API endpoint and fires the request.
   * Generation actions connect SSE for real-time progress streaming.
   *
   * @param action - Action identifier from CommandResult.action
   * @param payload - Action payload from CommandResult.actionPayload
   * @param chatId - Active chat ID
   */
  async dispatchCommandAction(action: string, payload: Record<string, unknown> | null, chatId: string,) {
    log.info("dispatchCommandAction", { action, chatId, },);

    if (action === "generate-image") {
      await dispatchGenerationAction(
        this,
        "/api/generation/image",
        {
          prompt: (payload?.prompt as string) ?? "",
          chatId,
        },
        "Image generation",
        chatId,
      );
      return;
    }

    if (action === "generate-caption") {
      const assetIds = (payload?.assetIds as string[]) ?? [];
      if (assetIds.length === 0) {
        this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noAssetsToCaption",), },);
        return;
      }
      await dispatchGenerationAction(
        this,
        "/api/generation/caption",
        {
          chatId,
          assetIds,
        },
        "Captioning",
        chatId,
      );
      return;
    }

    if (["generate-music", "generate-sfx", "generate-video",].includes(action,)) {
      const label = action.replace("generate-", "",);
      this.$dispatch?.("show-toast", {
        type: "info",
        message: t("toasts.actionNotImplemented", { label, },),
      },);
      log.info("Unimplemented generation action", { action, },);
      return;
    }

    if (action === "impersonate-toggle") {
      const mode = (payload?.mode as string) ?? "toggle";
      if (mode === "off") {
        await apiFetch(`/api/chats/${chatId}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: null, },),
        },);
        this.impersonationActive = false;
        this.impersonatingActorId = null;
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.impersonationEnded",), },);
      } else {
        await this.toggleImpersonate();
      }
      return;
    }

    if (action === "impersonate-select") {
      const characterName = (payload?.characterName as string) ?? "";
      if (!characterName) { return; }
      try {
        const res = await apiFetch(`/api/chats/${chatId}/participants`, {
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
          this.$dispatch?.("show-toast", {
            type: "warning",
            message: t("toasts.characterNotFound", { name: characterName, },),
          },);
          return;
        }
        const putRes = await apiFetch(`/api/chats/${chatId}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: target.actor_id, },),
        },);
        if (putRes.ok) {
          this.impersonationActive = true;
          this.impersonatingActorId = target.actor_id;
          this.$dispatch?.("show-toast", {
            type: "info",
            message: t("toasts.playingAs", { name: target.display_name || characterName, },),
          },);
        } else {
          const err = await putRes.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || t("toasts.failedStartImpersonation",),
          },);
        }
      } catch {
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorResolvingCharacter",), },);
      }
      return;
    }

    if (action === "create-quest") {
      await dispatchQuestAction(this, (payload?.description as string) ?? "", chatId,);
      return;
    }

    if (action === "review-entity") {
      log.info("review-entity action — display only", { payload, },);
      return;
    }

    log.warn("Unknown command action", { action, },);
    this.$dispatch?.("show-toast", {
      type: "warning",
      message: t("toasts.unknownAction", { action, },),
    },);
  },
};
