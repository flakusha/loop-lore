// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Chat ownership transfer panel.
// Drives `POST /api/chats/:id/transfer-ownership` with explicit confirmation
// gate. Pairs with `src/components/chat/transfer-panel.html`.
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "chat-transfer", },);

/** Successful transfer outcome returned by the server. */
export interface TransferOutcome {
  ok: boolean;
  chatId: string;
  previousOwnerId: string;
  newOwnerId: string;
  autoInvited: boolean;
}

/**
 * State plugin for the chat-ownership-transfer panel. Bound to a chat via
 * `setChatId`. Requires the operator to enter a new-owner id + reason and to
 * explicitly confirm the transfer before the request fires.
 */
export interface ChatTransferState {
  _txChatId: string | null;
  newOwnerId: string;
  reason: string;
  confirm: boolean;
  busy: boolean;
  message: string;
  error: string;
  lastResult: TransferOutcome | null;
  setChatId(chatId: string,): void;
  /** True when the form has all fields needed to fire the request. */
  canSubmit(): boolean;
  /** POST the transfer request. Returns true on a 2xx success. */
  submit(): Promise<boolean>;
  /** Clear status, error, and the last result. */
  reset(): void;
}

export const chatTransfer: ChatTransferState = {
  _txChatId: null,
  newOwnerId: "",
  reason: "",
  confirm: false,
  busy: false,
  message: "",
  error: "",
  lastResult: null,

  setChatId(chatId: string,) {
    if (this._txChatId === chatId) { return; }
    this._txChatId = chatId;
    this.newOwnerId = "";
    this.reason = "";
    this.confirm = false;
    this.busy = false;
    this.message = "";
    this.error = "";
    this.lastResult = null;
  },

  canSubmit() {
    return Boolean(this._txChatId && this.newOwnerId.trim() && this.confirm && !this.busy,);
  },

  async submit() {
    const chatId = this._txChatId;
    if (!chatId) {
      this.error = t("status.chatTransferNoChat",);
      return false;
    }
    if (!this.newOwnerId.trim()) {
      this.error = t("status.chatTransferNoOwner",);
      return false;
    }
    if (!this.confirm) {
      this.error = t("status.chatTransferConfirmRequired",);
      return false;
    }
    if (this.busy) { return false; }
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/chats/${chatId}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          newOwnerId: this.newOwnerId.trim(),
          confirm: true,
          reason: this.reason.trim() || undefined,
        },),
      },);
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };
        this.error = body.message ?? t("status.chatTransferFailed",);
        return false;
      }
      this.lastResult = (await res.json()) as TransferOutcome;
      this.message = t("status.chatTransferComplete",);
      // Reset the destructive form fields after success.
      this.confirm = false;
      this.reason = "";
      return true;
    } catch (error) {
      log.error("Failed to transfer ownership", error instanceof Error ? error : undefined, {},);
      this.error = t("status.chatTransferFailed",);
      return false;
    } finally {
      this.busy = false;
    }
  },

  reset() {
    this.newOwnerId = "";
    this.reason = "";
    this.confirm = false;
    this.message = "";
    this.error = "";
    this.lastResult = null;
  },
};

/** Build the Alpine scope for the chat-transfer panel. */
export function chatTransferFactory(chatId: string,): ChatTransferState {
  const state = Object.create(chatTransfer,) as ChatTransferState;
  state._txChatId = null;
  state.newOwnerId = "";
  state.reason = "";
  state.confirm = false;
  state.busy = false;
  state.message = "";
  state.error = "";
  state.lastResult = null;
  state.setChatId(chatId,);
  return state;
}

(globalThis as Record<string, unknown>).chatTransferFactory = chatTransferFactory;
