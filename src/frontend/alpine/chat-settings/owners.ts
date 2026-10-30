// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat co-ownership management for the chat settings modal.
 *
 * Backend contract (src/routes/chats/owners.ts):
 *   GET    /api/chats/:id/owners            → { chatId, owners }
 *   POST   /api/chats/:id/owners            { actorId, reason? } → { ok, chatId, userId, autoInvited, owners }
 *   DELETE /api/chats/:id/owners/:userId    ?reason= → { ok, chatId, userId, owners }
 *
 * Removing your own user id resigns ownership (server decides); the confirm
 * modal shows distinct copy for that case. The server enforces the 3-owner
 * cap, duplicates, and authority — the UI only pre-disables at the cap.
 */
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat-settings-owners", },);

/** Maximum co-owners per chat (mirrors the server-side cap). */
export const OWNER_CAP = 3;

/**
 * Co-owner management actions for the chat settings modal.
 *
 * Mixed into `chatSettings` so they run with full `ChatState` context.
 */
export const ownersActions: Partial<ChatState> & ThisType<ChatState> = {
  // ── Local UI state ────────────────────────────────────────
  /** Current owner user ids (sorted, from the GET endpoint). */
  _owners: [] as string[],
  /** True while the owners list request is in flight. */
  _ownersLoading: false,
  /** Error surfaced when the owners list cannot be loaded. */
  _ownersError: "" as string,
  /** Add-owner confirmation modal state. */
  _addOwnerModalOpen: false,
  _addOwnerId: "",
  _addOwnerReason: "",
  _addOwnerSubmitting: false,
  _addOwnerError: "" as string,
  /** Remove-owner confirmation modal state. */
  _removeOwnerModalOpen: false,
  _removeOwnerId: "",
  _removeOwnerReason: "",
  _removeOwnerSubmitting: false,
  _removeOwnerError: "" as string,
  /** True when the pending removal targets the current user (resign). */
  _removeOwnerResign: false,

  /**
   * Fetch the chat's owner ids from `GET /api/chats/:id/owners`.
   * Called when the chat settings modal opens.
   */
  async loadChatOwners() {
    this._owners = [];
    this._ownersError = "";
    if (!this.activeChat) { return; }
    this._ownersLoading = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/owners`,);
      if (res.ok) {
        const data = await res.json() as { owners?: string[] };
        this._owners = data.owners ?? [];
      } else {
        this._ownersError = `HTTP ${res.status}`;
      }
    } catch (err) {
      this._ownersError = err instanceof Error ? err.message : String(err,);
      log.warn("failed to load chat owners", {
        chatId: this.activeChat,
        error: this._ownersError,
      },);
    } finally {
      this._ownersLoading = false;
    }
  },

  /** Predicate: has the chat reached the co-owner cap? */
  ownerCapReached(): boolean {
    return this._owners.length >= OWNER_CAP;
  },

  /**
   * Display name for an owner id: resolves against the loaded participant
   * list (`display_name || name`), falling back to the raw id.
   * @param userId - owner user id
   */
  ownerName(userId: string,): string {
    const p = this._chatParticipants?.find((p,) => p.actor_id === userId);
    return p?.display_name ?? p?.name ?? userId;
  },

  /** Participants eligible to become co-owners (not already owners). */
  addableParticipants(): { actor_id: string; name: string; display_name?: string }[] {
    return (this._chatParticipants ?? []).filter((p,) => !this._owners.includes(p.actor_id,));
  },

  /** Open the add-owner modal, resetting prior state. */
  openAddOwnerModal() {
    if (!this.activeChat) { return; }
    this._addOwnerId = "";
    this._addOwnerReason = "";
    this._addOwnerError = "";
    this._addOwnerModalOpen = true;
  },

  /** @returns {void} */
  closeAddOwnerModal() {
    this._addOwnerModalOpen = false;
    this._addOwnerError = "";
    this._addOwnerSubmitting = false;
  },

  /**
   * Submit the add-owner request. Sets `_addOwnerSubmitting` during the
   * request and surfaces server errors in `_addOwnerError`. On success,
   * closes the modal, adopts the returned owners list, and reloads the
   * participant list so the new owner appears without a page refresh.
   */
  async submitAddOwner() {
    if (!this.activeChat) { return; }
    const actorId = (this._addOwnerId ?? "").trim();
    if (!actorId) {
      this._addOwnerError = t("chat.owners.selectParticipant",);
      return;
    }

    const reason = (this._addOwnerReason ?? "").trim();
    this._addOwnerSubmitting = true;
    this._addOwnerError = "";

    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          actorId,
          ...(reason ? { reason, } : {}),
        },),
      },);

      if (!res.ok) {
        this._addOwnerError = await errorMessage(res,);
        return;
      }

      const json = (await res.json()) as {
        ok: boolean;
        userId: string;
        owners: string[];
      };

      log.info("co-owner added", {
        chatId: this.activeChat,
        userId: json.userId,
      },);

      this._owners = json.owners;
      this._addOwnerModalOpen = false;
      this._addOwnerError = "";
      // Refresh participants so the new owner appears by name everywhere.
      await this.loadChatParticipants?.();
    } catch (err) {
      log.warn("add owner submit failed", {
        chatId: this.activeChat,
        error: err instanceof Error ? err.message : String(err,),
      },);

      this._addOwnerError = err instanceof Error ? err.message : String(err,);
    } finally {
      this._addOwnerSubmitting = false;
    }
  },

  /**
   * Open the remove-owner confirm modal for `userId`. When the target is
   * the current user the modal shows resign copy instead of removal copy.
   * @param userId - owner user id to remove (self = resign)
   */
  openRemoveOwnerModal(userId: string,) {
    if (!this.activeChat) { return; }
    this._removeOwnerId = userId;
    this._removeOwnerReason = "";
    this._removeOwnerError = "";
    this._removeOwnerResign = userId === globalThis.__USER_ID;
    this._removeOwnerModalOpen = true;
  },

  /** @returns {void} */
  closeRemoveOwnerModal() {
    this._removeOwnerModalOpen = false;
    this._removeOwnerError = "";
    this._removeOwnerSubmitting = false;
  },

  /**
   * Submit the remove/resign request via DELETE. On success adopts the
   * returned owners list and reloads participants.
   */
  async submitRemoveOwner() {
    if (!this.activeChat || !this._removeOwnerId) { return; }
    const reason = (this._removeOwnerReason ?? "").trim();
    this._removeOwnerSubmitting = true;
    this._removeOwnerError = "";

    try {
      let url = `/api/chats/${this.activeChat}/owners/${encodeURIComponent(this._removeOwnerId,)}`;
      if (reason) { url += `?reason=${encodeURIComponent(reason,)}`; }

      const res = await apiFetch(url, { method: "DELETE", },);

      if (!res.ok) {
        this._removeOwnerError = await errorMessage(res,);
        return;
      }

      const json = (await res.json()) as {
        ok: boolean;
        userId: string;
        owners: string[];
      };

      log.info("owner removed", {
        chatId: this.activeChat,
        userId: json.userId,
        resign: this._removeOwnerResign,
      },);

      this._owners = json.owners;
      this._removeOwnerModalOpen = false;
      this._removeOwnerError = "";
      await this.loadChatParticipants?.();
    } catch (err) {
      log.warn("remove owner submit failed", {
        chatId: this.activeChat,
        error: err instanceof Error ? err.message : String(err,),
      },);

      this._removeOwnerError = err instanceof Error ? err.message : String(err,);
    } finally {
      this._removeOwnerSubmitting = false;
    }
  },
};

/**
 * Extract a human-readable message from a failed response.
 * @param res - non-ok fetch response with the `{ error, code, meta }` envelope
 */
async function errorMessage(res: Response,): Promise<string> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) { message = body.error; }
  } catch { /* non-JSON error body — keep generic message */ }

  return message;
}
