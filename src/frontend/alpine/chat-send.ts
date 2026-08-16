// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat message send logic — optimistic temp message, client-side encryption,
 * attachment payload, and the POST to /api/chats/:id/messages.
 *
 * Extracted from chat-messages.ts; methods are merged into the chatMessages
 * object at call time, so `this` still resolves to the full ChatState.
 */

import { browserCompressThenEncrypt, } from "../browser";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, Message, } from "./types";

const log = rootLog.child({ module: "chat", },);

/** Build request body for sendMessage (handles encryption + attachments). */
async function buildSendBody(
  ctx: any,
  text: string,
  msgs: Array<{ id: string }>,
  pendingAssets: Array<{ assetId: string }>,
) {
  const body: Record<string, unknown> = {};
  if (text) {
    if (ctx._encryptionEnabled && ctx._chatKey && ctx._keyId) {
      body.content = await browserCompressThenEncrypt(text, ctx._chatKey, ctx._keyId,);
      log.debug("Message encrypted client-side before send",);
    } else {
      body.content = text;
    }
  }
  const lastMsg = msgs.findLast((m,) => !m.id.startsWith("temp-",));
  if (lastMsg) { body.parentId = lastMsg.id; }
  if (pendingAssets.length > 0) {
    body.attachments = Array.from(pendingAssets, (a, i,) => ({
      assetId: a.assetId,
      order: i,
      label: "message-attachment",
    }),);
  }
  return body;
}

/** Remove optimistic temp messages after send failure. */
function removeTempMessages(ctx: ChatState, msgs: Array<{ id: string }>,) {
  const filtered: Message[] = [];
  for (const m of msgs) { if (!m.id.startsWith("temp-",)) { filtered.push(m as Message,); } }
  ctx.messages = filtered;
}

export const chatSendMethods: Partial<ChatState> & ThisType<ChatState> = {
  async sendMessage() {
    log.info("sendMessage", { chatId: this.activeChat, },);
    const input = this.$refs.messageInput as HTMLTextAreaElement;
    const text = input.value.trim() ?? "";
    const pendingAssets = this.pendingAssets ?? [];
    if (!text && pendingAssets.length === 0) { return; }
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
      return;
    }

    // A human-initiated send resets the automated-fire consecutive counter.
    if (!this._autoFired) {
      this._consecutiveAutoFires = 0;
    }

    const msgs = this.messages;
    msgs.push({
      id: `temp-${Date.now()}`,
      role: "user",
      content: text || "(attached media)",
      created_at: new Date().toISOString(),
    },);
    input.value = "";
    this.autoResize(input,);
    this.$nextTick?.(() => this.scrollToBottom());

    const body = await buildSendBody(this, text, msgs, pendingAssets,);

    this.isGenerating = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);
      if (res.ok) {
        this.pendingAssets = [];
        const data = await res.json();
        if (data.action) {
          await this.dispatchCommandAction(data.action, data.actionPayload ?? null, this.activeChat,);
        } else {
          this.connectGenerationSSE(this.activeChat,);
        }
        await this.loadMessages();
        await this.loadChats();
        // Finalize an automated send: count it for the loop-guard cap and
        // clear the in-flight flag now that the send has landed.
        if (this._autoFired) {
          this._consecutiveAutoFires += 1;
        }
        this._autoFired = false;
        // A human send triggers `user`-triggered automation (auto sends do not).
        if (!this._autoFired && this._consecutiveAutoFires === 0) {
          await this.fireAutoQuickReplies("user",);
        }
      } else {
        this.isGenerating = false;
        this._autoFired = false;
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedSend",), },);
        removeTempMessages(this, msgs,);
      }
    } catch {
      this.isGenerating = false;
      this._autoFired = false;
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkError",), },);
      removeTempMessages(this, msgs,);
    }
  },
};
