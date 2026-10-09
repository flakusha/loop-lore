// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat message send logic — optimistic temp message, client-side encryption,
 * attachment payload, and the POST to /api/v1/chats/:id/messages.
 *
 * Extracted from chat-messages.ts; methods are merged into the chatMessages
 * object at call time, so `this` still resolves to the full ChatState.
 *
 * Frontend slash routing (`interceptSlashSend`): `/continue`, `/branch`,
 * `/retry` resume prior assistant state through the existing
 * variant/branch actions instead of sending a chat message; unknown `/...`
 * names toast (with a did-you-mean hint when close) and never send.
 */

import { browserCompressThenEncrypt, browserRandomUUIDv7, } from "../browser";
import { isVnDecisionPending, } from "../vn/pending-decision";
import { requireActiveChat, } from "./chat-guards";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import { didYouMeanCandidate, } from "./slash-autocomplete";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat", },);

/** Counter prefix marker for optimistic temp ids; the full id embeds a UUIDv7. */
const TEMP_PREFIX = "tmp-";

/**
 * Build request body for sendMessage (handles encryption + attachments).
 * @param ctx
 * @param text
 * @param msgs
 * @param pendingAssets
 */
async function buildSendBody(
  ctx: ChatState,
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

  const lastMsg = msgs.findLast((m,) => !m.id.startsWith(TEMP_PREFIX,));
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

/**
 * Remove one optimistic temp message after its send failed.
 *
 * Scoped to the exact temp id so a failure does not strip temp messages
 * belonging to concurrent optimistic sends.
 * @param ctx
 * @param tempId
 */
function removeTempMessage(ctx: ChatState, tempId: string,) {
  ctx.messages = ctx.messages.filter((m,) => m.id !== tempId);
}

/**
 * Last assistant/character message id — the resume point for `/continue`.
 * @param ctx
 */
function lastAssistantMessageId(ctx: ChatState,): string | null {
  for (let i = ctx.messages.length - 1; i >= 0; i--) {
    const msg = ctx.messages[i]!;
    if (msg.role === "assistant" || msg.role === "character") { return msg.id; }
  }

  return null;
}

export const chatSendMethods: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Frontend slash router: `/continue` resumes the last assistant message.
   * @param {string} text
   * @param {HTMLTextAreaElement} input
   * @returns {Promise<boolean>} true when intercepted (do not send).
   */
  async interceptSlashSend(text: string, input: HTMLTextAreaElement,): Promise<boolean> {
    const token = text.split(/\s+/,)[0] ?? "";
    const name = token.slice(1,).toLowerCase();
    const args = text.slice(token.length,).trim().split(/\s+/,).filter(Boolean,);
    if (!name) { return false; }
    const registry = (this._commandList ?? []).map((entry,) => entry.name);

    if (name === "continue") {
      const target = lastAssistantMessageId(this,);
      if (!target) {
        this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.nothingToContinue",), },);
      } else {
        input.value = "";
        await this.continueMessage?.(target,);
      }

      return true;
    }

    if (name === "retry") {
      // `/retry [attemptId] [step]`: args split into ids vs step numbers —
      // `/retry 2` with an active attempt means step 2, not attempt "2".
      const numeric = args.filter((arg,) => /^\d+$/.test(arg,));
      const nonNumeric = args.filter((arg,) => !/^\d+$/.test(arg,));
      const attemptId = this.activeAttemptId ?? nonNumeric[0];
      const step = Number(numeric[0] ?? 0,) || 0;
      if (!attemptId) {
        this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.nothingToRetry",), },);
      } else {
        input.value = "";
        await this.retryFromPoint?.(String(attemptId,), Number.isFinite(step,) ? step : 0,);
      }

      return true;
    }

    if (name === "branch") {
      const target = lastAssistantMessageId(this,);
      if (!target) {
        this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.nothingToBranch",), },);
      } else {
        input.value = "";
        await this.forkFromMessage?.(target, args.join(" ",) || undefined,);
      }

      return true;
    }

    if (registry.length > 0 && !registry.map((entry,) => entry.toLowerCase()).includes(name,)) {
      const suggestion = didYouMeanCandidate(registry, name,);
      this.$dispatch?.("show-toast", {
        type: "warning",
        message: suggestion
          ? t("toasts.unknownCommandSuggest", { name, suggestion, },)
          : t("toasts.unknownCommand", { name, },),
      },);

      return true;
    }

    return false;
  },

  async sendMessage() {
    log.info("sendMessage", { chatId: this.activeChat, },);
    const input = this.$refs.messageInput as HTMLTextAreaElement;
    const text = input.value.trim() ?? "";
    const pendingAssets = this.pendingAssets ?? [];
    if (!text && pendingAssets.length === 0) { return; }
    if (!requireActiveChat(this,)) { return; }

    // Frontend-only slash interception (chat + group share this send path).
    // (TASK-slash-commands-chat-group-assistant; see interceptSlashSend.)
    if (text.startsWith("/",) && pendingAssets.length === 0 && typeof this.interceptSlashSend === "function") {
      const handled = await this.interceptSlashSend(text, input,);
      if (handled) { return; }
    }

    // VN decision gate (client side). The server is authoritative —
    // enforceVnDecisionGate 409s regardless of what happens here. This exists
    // only so the player does not see a message optimistically appear and then
    // roll back: the push below happens at ~188 and the input clears at ~197,
    // both BEFORE the POST.
    //
    // Placed AFTER slash interception so /continue, /retry and /branch keep
    // working while a decision is pending — the gate blocks free send, not the
    // command surface.
    //
    // _autoFired sends are exempt: the automated loop cannot answer a card, so
    // gating it would deadlock the loop's own consecutive-fire guard.
    if (!this._autoFired && isVnDecisionPending()) {
      this.$dispatch?.("show-toast", {
        type: "warning",
        message: t("toasts.vnDecisionPending",),
      },);

      return;
    }

    // A human-initiated send resets the automated-fire consecutive counter.
    if (!this._autoFired) {
      this._consecutiveAutoFires = 0;
    }

    // Unique id per optimistic send so rollback can target exactly this message.
    // UUIDv7 gives chronological ordering without a per-load counter; the
    // `tmp-` prefix flags the row as an optimistic placeholder (consumed
    // by `findLast` above to pick the real parent). `getRandomValues` works
    // in insecure contexts (plain-http LAN), unlike `crypto.randomUUID`.
    const tempId = `${TEMP_PREFIX}${browserRandomUUIDv7()}`;
    const msgs = this.messages;
    msgs.push({
      id: tempId,
      role: "user",
      content: text || "(attached media)",
      created_at: new Date().toISOString(),
    },);

    // Optimistic clear — restored below when the send fails so typed text is
    // never lost (BUG-chat-input-fills-up-but-send-is-impossible).
    input.value = "";
    this.autoResize(input,);

    const restoreInput = () => {
      // Only when the user has not started typing a new message meanwhile.
      if (input.value === "") {
        input.value = text;
        this.autoResize(input,);
      }
    };

    this.$nextTick?.(() => this.scrollToBottom());

    const body = await buildSendBody(this, text, msgs, pendingAssets,);

    this.isGenerating = true;
    try {
      const res = await apiFetch(
        `/api/v1/chats/${this.activeChat}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(body,),
          idempotencyKey: true,
        } as Parameters<typeof apiFetch>[1],
      );

      if (res.ok) {
        this.pendingAssets = [];
        this.clearComposerDraft();
        const data = await res.json();
        if (data.action) {
          await this.dispatchCommandAction(data.action, data.actionPayload ?? null, this.activeChat,);
          // Command actions do not open a generation SSE — clear the flag so
          // the UI can switch chats. Without this, a non-generation dispatch
          // (e.g. slash-command response) bricks `selectChat`.
          this.isGenerating = false;
        } else {
          await this.sendWithPreferredMode(this.activeChat,);
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
        // A 503 carrying a persisted id means the user message was stored
        // but the assistant reply failed — reconcile instead of duplicating.
        if (err.id) {
          this.messages = this.messages.map((m,) => m.id === tempId ? { ...m, id: err.id as string, } : m);

          this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedSend",), },);
          await this.loadMessages();
          return;
        }

        this.$dispatch?.("show-toast", { type: "error", message: err.error || t("toasts.failedSend",), },);
        removeTempMessage(this, tempId,);
        restoreInput();
        this.flushComposerDraft();
      }
    } catch {
      this.isGenerating = false;
      this._autoFired = false;
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkError",), },);
      removeTempMessage(this, tempId,);
      restoreInput();
      this.flushComposerDraft();
    }
  },
};
