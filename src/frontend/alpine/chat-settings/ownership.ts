// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { can, } from "../../../users/permissions";
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
 * Backend contract: POST /api/v1/chats/:id/transfer-ownership with
 *   { newOwnerId: string, confirm: true, reason?: string }
 *
 * Returns 200 on success with `{ ok, previousOwnerId, newOwnerId, autoInvited }`.
 * Returns 400 for self-transfer / invalid request, 403 for forbidden,
 * 404 for unknown chat.
 *
 * The action reloads the participant list on success so the new owner
 * appears in the role list without a full page refresh.
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

  /**
   * @returns {void}
   */
  openOwnershipTransferModal() {
    if (!this.activeChat) { return; }
    this._ownershipNewOwnerId = "";
    this._ownershipReason = "";
    this._ownershipError = "";
    this._ownershipModalOpen = true;
  },

  /**
   * @returns {void}
   */
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
        `/api/v1/chats/${this.activeChat}/transfer-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            newOwnerId,
            confirm: true,
            ...(reason ? { reason, } : {}),
          },),
        },
      );

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          // API error envelope: { error, code, meta } (jsonError/jsonValidationError).
          const body = (await res.json()) as { error?: string };
          if (body?.error) { message = body.error; }
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
   *
   * Mirrors the server rule in `transferOwnership` (src/chat/service/ownership.ts):
   * the chat owner (`chats.created_by`) may transfer, and roles holding the
   * `admin.chat` permission bypass the owner check. The chat row the panel
   * already has (`this.chats`) carries `created_by`, so no extra request is
   * needed.
   */
  canTransferOwnership(): boolean {
    if (!this.activeChat) { return false; }

    if (can(this.userRole, "admin.chat",)) { return true; }

    const chat = this.chats?.find((c,) => c.id === this.activeChat);
    if (!chat?.created_by) { return false; }

    return chat.created_by === globalThis.__USER_ID;
  },
};
