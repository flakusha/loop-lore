// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat-settings-ownership", },);

/**
 * Chat ownership transfer actions for the chat settings modal.
 *
 * Mixed into `chatSettings` so they run with full `ChatState` context.
 *
 * Backend contract: POST /api/chats/:id/transfer-ownership with
 *   { newOwnerId: string, reason?: string }
 *
 * Returns 200 on success with `{ ok, previousOwnerId, newOwnerId, autoInvited }`.
 * Returns 400 for self-transfer / invalid request, 403 for forbidden,
 * 404 for unknown chat.
 *
 * The action reloads the participant list on success so the new owner
 * appears in the role list without a full page refresh.
 *
 * TODO(chat-ownership): no template wires openOwnershipTransferModal / _ownershipModalOpen
 * yet, and there is no ownership-actions.test.ts (persona has one; the coverage gate floors
 * each module) — actions are unreachable from UI until the settings-modal markup lands.
 */
export const ownershipActions: Partial<ChatState> & ThisType<ChatState> = {
  // ── Local UI state ────────────────────────────────────────
  // `_ownershipModalOpen` controls visibility of the transfer-ownership
  // confirmation modal. `_ownershipNewOwnerId` is the selected target.
  // `_ownershipReason` is the optional free-text reason field.
  // `_ownershipSubmitting` disables the submit button during the request.
  // `_ownershipError` surfaces the most recent error message from the server.
  _ownershipModalOpen: false,
  _ownershipNewOwnerId: "",
  _ownershipReason: "",
  _ownershipSubmitting: false,
  _ownershipError: "" as string,

  openOwnershipTransferModal() {
    if (!this.activeChat) { return; }
    this._ownershipNewOwnerId = "";
    this._ownershipReason = "";
    this._ownershipError = "";
    this._ownershipModalOpen = true;
  },

  closeOwnershipTransferModal() {
    this._ownershipModalOpen = false;
    this._ownershipError = "";
    this._ownershipSubmitting = false;
  },

  /**
   * Submit the ownership-transfer request. Sets `_ownershipSubmitting` during
   * the request and surfaces server errors in `_ownershipError`. On success,
   * closes the modal and triggers a chat reload.
   */
  async submitOwnershipTransfer() {
    if (!this.activeChat) { return; }
    const newOwnerId = (this._ownershipNewOwnerId ?? "").trim();
    if (!newOwnerId) {
      this._ownershipError = "Select a participant";
      return;
    }

    const reason = (this._ownershipReason ?? "").trim();
    this._ownershipSubmitting = true;
    this._ownershipError = "";

    try {
      const res = await apiFetch(
        `/api/chats/${this.activeChat}/transfer-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            newOwnerId,
            ...(reason ? { reason, } : {}),
          },),
        },
      );

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) { message = body.message; }
        } catch { /* non-JSON error body — keep generic message */ }
        this._ownershipError = message;
        return;
      }

      const json = (await res.json()) as {
        ok: boolean;
        newOwnerId: string;
        previousOwnerId: string;
        autoInvited: boolean;
      };
      log.info("ownership transferred", {
        chatId: this.activeChat,
        previousOwnerId: json.previousOwnerId,
        newOwnerId: json.newOwnerId,
        autoInvited: json.autoInvited,
      },);

      this._ownershipModalOpen = false;
      this._ownershipSubmitting = false;
      this._ownershipError = "";

      // Refresh participants so the new owner appears in the role list.
      await this.loadChatParticipants?.();
    } catch (err) {
      log.warn("ownership transfer submit failed", {
        chatId: this.activeChat,
        error: err instanceof Error ? err.message : String(err,),
      },);
      this._ownershipError = err instanceof Error ? err.message : String(err,);
    } finally {
      this._ownershipSubmitting = false;
    }
  },

  /**
   * Predicate: is the current user allowed to attempt a transfer?
   * Backend re-checks authority on the route; this is purely a UX hint to
   * hide the button when no chat is active. True auth lives server-side.
   * TODO(chat-ownership): gate on created_by/admin instead of !!activeChat — every
   * non-owner currently sees the button and eats a 403 on submit.
   */
  canTransferOwnership(): boolean {
    return !!this.activeChat;
  },
};
