import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat-actions", },);

export const media: Partial<ChatState> & ThisType<ChatState> = {
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
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedCaption",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorCaptioning",), },);
    }
  },
};
