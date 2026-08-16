// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import type { ChatState, } from "../types";

export const impersonation: Partial<ChatState> & ThisType<ChatState> = {
  async toggleImpersonate() {
    if (!this.activeChat || !this.currentCharacter) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noChatOrCharacter",), },);
      return;
    }

    try {
      if (this.impersonationActive) {
        const res = await apiFetch(`/api/v1/chats/${this.activeChat}/impersonate`, {
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
        const res = await apiFetch(`/api/v1/chats/${this.activeChat}/impersonate`, {
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
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
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
};
