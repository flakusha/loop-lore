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
import { interceptSlashSend, } from "./chat-slash";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
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

export const chatSendMethods: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Frontend slash router: `/continue` resumes the last assistant message.
   *
   * The routing table itself lives in chat-slash.ts (per-file size gate);
   * `this` is passed as the ctx so the merged ChatState surface is unchanged.
   * @param {string} text
   * @param {HTMLTextAreaElement} input
   * @returns {Promise<boolean>} true when intercepted (do not send).
   */
  interceptSlashSend(text: string, input: HTMLTextAreaElement,): Promise<boolean> {
    return interceptSlashSend(this, text, input,);
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
    // _autoFired sends are exempt, but NOT because gating them would deadlock:
    // `_consecutiveAutoFires` only increments inside the `res.ok` branch, so a
    // refused auto-send simply does not advance the counter and there is no
    // re-fire to starve — the loop would just pause until a human resolves the
    // decision. The exemption is about noise: an automated burst that cannot
    // answer a card would raise one warning toast per message. The server gate
    // does not exempt them — they are still rejected with a 409 there, and
    // `restoreInput()` puts the composed text back.
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

    // One key per send, shared by header + body: the server's header cache
    // (10s window) and the DB unique index (migration 045) then coalesce the
    // same logical turn instead of minting independent keys per layer.
    const idempotencyKey = crypto.randomUUID();
    const body = await buildSendBody(this, text, msgs, pendingAssets,);
    body.idempotencyKey = idempotencyKey;

    this.isGenerating = true;
    try {
      const res = await apiFetch(
        `/api/v1/chats/${this.activeChat}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(body,),
          idempotencyKey,
        } as Parameters<typeof apiFetch>[1],
      );

      if (res.ok) {
        this.pendingAssets = [];
        this.clearComposerDraft();
        const data = await res.json();
        // A command response (`command` present) never starts a generation:
        // the server answers with the command's system message and, when the
        // command has one, an action — and creates no generation buffer for
        // it. Keying this branch on `action` alone sent every action-less
        // command (/help, /char-list, ...) down the generation SSE, where the
        // client waits 15s for a buffer that never arrives and then toasts
        // "Generation failed" with the spinner still up.
        if (data.action || data.command) {
          if (data.action) {
            await this.dispatchCommandAction(data.action, data.actionPayload ?? null, this.activeChat,);
          }

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

        // A 409 from the VN decision gate names the scene holding the
        // unresolved card. Cards only render for the CURRENT scene, so without
        // this jump the player sits at scene 12 staring at an empty stage with
        // every send rejected and no Skip control in sight — the 409 text says
        // "skip it from the card", but there is no card to skip. Navigate first,
        // then report.
        //
        // Dispatched as an event rather than a direct `jumpToScene` call: the
        // composer must not import the scene renderer (it would drag the whole
        // sprite/portrait/transition chain into the chat bundle for a code path
        // most chats never hit). Same seam the location handler already uses.
        if (res.status === 409 && Number.isInteger(err.data?.sceneIndex,)) {
          globalThis.dispatchEvent(
            new CustomEvent("vn:navigate-to-scene", {
              detail: { sceneIndex: err.data.sceneIndex as number, },
            },),
          );
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
