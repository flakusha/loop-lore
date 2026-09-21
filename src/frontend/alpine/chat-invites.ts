// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Chat invites: create/copy/revoke per-chat invite codes + redeem ──
//
// Mirrors world-invites.ts (world-scoped) for the chat-scoped endpoints in
// src/routes/invites.ts: POST/GET /api/v1/chats/:id/invites,
// DELETE /api/v1/chats/:id/invites/:inviteId, POST /api/v1/invites/:code/join.
// Owner-gated server-side (isChatOwner); 404 on non-owned chats.
import type { ChatInviteRow, } from "./chat-types/world-channels";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

export const chatInvites: Partial<ChatState> & ThisType<ChatState> = {
  _chatInvites: [] as ChatInviteRow[],
  _chatInvitesLoading: false,
  _chatInvitesLoaded: false,
  _newChatInviteMaxUses: "",
  _showChatInviteForm: false,
  _chatJoinCode: "",
  async loadChatInvites() {
    if (!this.activeChat) { return; }
    this._chatInvitesLoading = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/invites`,);
      if (!res.ok) { return; }
      const body = await res.json() as { data?: ChatInviteRow[] };
      this._chatInvites = body.data ?? [];
      this._chatInvitesLoaded = true;
    } finally {
      this._chatInvitesLoading = false;
    }
  },

  async createChatInvite() {
    if (!this.activeChat) { return; }
    const trimmed = this._newChatInviteMaxUses.trim();
    const maxUses = trimmed ? Number(trimmed,) : null;
    if (maxUses !== null && (!Number.isInteger(maxUses,) || maxUses < 1)) {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.maxUsesPositiveInteger",), },);
      return;
    }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ maxUses, },),
      },);
      if (res.ok) {
        const invite = (await res.json()) as ChatInviteRow;
        this._chatInvites = [invite, ...this._chatInvites,];
        this._newChatInviteMaxUses = "";
        this._showChatInviteForm = false;
        await this.copyChatInviteCode(invite.code,);
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.inviteCreatedAndCopied", { code: invite.code, },),
        },);
      } else {
        const err = await res.json() as { error?: string };
        this.$dispatch?.("show-toast", { type: "error", message: err.error ?? t("toasts.failedCreateInvite",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkError",), },);
    }
  },

  async copyChatInviteCode(code: string,) {
    if (!navigator.clipboard) { return; }
    try {
      await navigator.clipboard.writeText(code,);
    } catch { /* clipboard unavailable — code already shown in panel */ }
  },

  async revokeChatInvite(inviteId: string,) {
    if (!this.activeChat) { return; }
    const invite = this._chatInvites.find((row,) => row.id === inviteId);
    if (!invite) { return; }
    if (!confirm(t("worlds.revokeInviteConfirm", { code: invite.code, },),)) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/invites/${inviteId}`, {
        method: "DELETE",
      },);
      if (res.ok || res.status === 204) {
        this._chatInvites = this._chatInvites.filter((row,) => row.id !== inviteId);
        this.$dispatch?.("show-toast", { type: "success", message: t("toasts.inviteRevoked",), },);
      } else {
        const err = await res.json() as { error?: string };
        this.$dispatch?.("show-toast", { type: "error", message: err.error ?? t("toasts.failedRevokeInvite",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkError",), },);
    }
  },

  async joinChatByCode() {
    const code = (this._chatJoinCode || "").trim();
    if (!code) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.enterChatInviteCode",), },);
      return;
    }
    try {
      const res = await apiFetch(`/api/v1/invites/${encodeURIComponent(code,)}/join`, {
        method: "POST",
      },);
      if (!res.ok) {
        const body = await res.json() as { message?: string; error?: string };
        this.$dispatch?.("show-toast", {
          type: "error",
          message: body.message ?? body.error ?? t("toasts.couldNotJoinChat",),
        },);
        return;
      }
      const outcome = await res.json() as { chatId?: string; alreadyMember?: boolean };
      this._chatJoinCode = "";
      this.$dispatch?.("show-toast", {
        type: "success",
        message: t(outcome.alreadyMember ? "toasts.alreadyChatMember" : "toasts.joinedChat",),
      },);
      await this.loadChats?.();
      if (typeof outcome.chatId === "string" && outcome.chatId) {
        await this.selectChat?.(outcome.chatId,);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkError",), },);
    }
  },
};
