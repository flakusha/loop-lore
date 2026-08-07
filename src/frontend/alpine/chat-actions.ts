import { formattedGenerationTime, formattedTokensPerSecond, statsLine, } from "./chat-stats";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

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

export const chatActions: Partial<ChatState> & ThisType<ChatState> = {
  _showCommandPalette: false,
  _activeCommand: "",
  _commandList: [
    { name: "help", description: t("commands.help",), },
    { name: "roll", description: t("commands.roll",), },
    { name: "summarize", description: t("commands.summarize",), },
    { name: "impersonate", description: t("commands.impersonate",), },
    { name: "narrate", description: t("commands.narrate",), },
    { name: "ooc", description: t("commands.ooc",), },
    { name: "debug", description: t("commands.debug",), },
    { name: "detail", description: t("commands.detail",), },
    { name: "improve", description: t("commands.improve",), },
    { name: "context", description: t("commands.context",), },
    { name: "image", description: t("commands.image",), },
    { name: "quest", description: t("commands.quest",), },
    { name: "video", description: t("commands.video",), },
    { name: "sfx", description: t("commands.sfx",), },
    { name: "sound", description: t("commands.sound",), },
    { name: "music", description: t("commands.music",), },
    { name: "caption", description: t("commands.caption",), },
    { name: "create", description: t("commands.create",), },
    { name: "review", description: t("commands.review",), },
    { name: "clear", description: t("commands.clear",), },
    { name: "stats", description: t("commands.stats",), },
  ] as { name: string; description: string }[],
  _filteredCommands: [] as { name: string; description: string }[],

  handleCommandInput(event: Event,) {
    const input = event.target as HTMLTextAreaElement;
    const value = input.value;
    if (value.startsWith("/",) && !value.includes(" ",)) {
      const query = value.slice(1,).toLowerCase();
      this._showCommandPalette = true;
      if (query) {
        const filtered: typeof this._commandList = [];
        for (const c of this._commandList) { if (c.name.includes(query,)) { filtered.push(c,); } }
        this._filteredCommands = filtered;
      } else {
        this._filteredCommands = this._commandList;
      }
    } else {
      this._showCommandPalette = false;
    }
  },

  selectCommand(name: string,) {
    const input = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    if (input) {
      input.value = `/${name} `;
      input.focus();
    }
    this._showCommandPalette = false;
  },

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
  async toggleImpersonate() {
    if (!this.activeChat || !this.currentCharacter) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noChatOrCharacter",), },);
      return;
    }

    try {
      if (this.impersonationActive) {
        const res = await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: null, },),
        },);
        if (res.ok) {
          this.impersonationActive = false;
          this.impersonatingActorId = null;
          this.$dispatch?.("show-toast", { type: "info", message: t("toasts.impersonationEnded",), },);
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || t("toasts.failedEndImpersonation",),
          },);
        }
      } else {
        const res = await apiFetch(`/api/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: this.currentCharacter.id, },),
        },);
        if (res.ok) {
          this.impersonationActive = true;
          this.impersonatingActorId = this.currentCharacter.id;
          this.$dispatch?.("show-toast", {
            type: "info",
            message: t("toasts.playingAs", {
              name: this.currentCharacter.display_name || this.currentCharacter.name || "",
            },),
          },);
        } else {
          const err = await res.json();
          this.$dispatch?.("show-toast", {
            type: "error",
            message: err.error || t("toasts.failedStartImpersonation",),
          },);
        }
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorTogglingImpersonation",), },);
    }
  },

  async loadImpersonationState() {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const data = await res.json();
      const participants = data.data || [];
      const me = participants.find(
        (p: { actor_id: string; display_name?: string },) =>
          p.actor_id === this.userRole || p.display_name === this.userDisplayName,
      );
      if (!me) {
        const selfParticipant = participants.find(
          (p: { impersonate_actor_id?: string | null },) => !!p.impersonate_actor_id,
        );
        if (selfParticipant) {
          this.impersonationActive = true;
          this.impersonatingActorId = selfParticipant.impersonate_actor_id!;
        }
        return;
      }
      if (me.impersonate_actor_id) {
        this.impersonationActive = true;
        this.impersonatingActorId = me.impersonate_actor_id as string;
      } else {
        this.impersonationActive = false;
        this.impersonatingActorId = null;
      }
    } catch {
      // Silent
    }
  },

  async generateImageFromMessage(msgId: string,) {
    log.info("generateImageFromMessage", { messageId: msgId, },);
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }
    const msg = this.messages.find((m,) => m.id === msgId);
    const prompt = msg?.content?.slice(0, 500,) ?? "";
    if (!prompt) {
      this.$dispatch?.("show-toast", {
        type: "warning",
        message: t("toasts.messageNoContentForImage",),
      },);
      return;
    }
    try {
      const res = await apiFetch("/api/generation/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ chatId: this.activeChat, messageId: msgId, prompt, },),
      },);
      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.imageGenerationStarted",), },);
      } else if (res.status === 501) {
        this.$dispatch?.("show-toast", {
          type: "info",
          message: t("toasts.imageGenerationNotConfigured",),
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err.error || t("toasts.failedGenerateImage",),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorGeneratingImage",), },);
    }
  },

  async captionMessage(msgId: string,) {
    log.info("captionMessage", { messageId: msgId, },);
    const msg = this.messages.find((m,) => m.id === msgId);
    if (!msg) { return; }
    const attachments = msg.attachments ?? [];
    const imageAttachments: NonNullable<typeof msg.attachments> = [];
    for (const a of attachments) { if (a.type === "image") { imageAttachments.push(a,); } }
    if (imageAttachments.length === 0) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noImagesToCaption",), },);
      return;
    }
    try {
      const res = await apiFetch("/api/generation/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          chatId: this.activeChat,
          messageId: msgId,
          assetIds: Array.from(imageAttachments, (a,) => a.assetId,),
        },),
      },);
      if (res.ok) {
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.captioningStarted",), },);
      } else if (res.status === 501) {
        this.$dispatch?.("show-toast", {
          type: "info",
          message: t("toasts.captioningNotConfigured",),
        },);
      } else {
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedCaption",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorCaptioning",), },);
    }
  },

  formattedGenerationTime,
  formattedTokensPerSecond,
  statsLine,
};
