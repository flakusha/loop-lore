// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { jsonBody, } from "../json";
import type { ChatState, } from "../types";

/**
 * Persona and impersonation actions for the chat settings modal. Mixed into
 * `chatSettings` so they run with full `ChatState` context.
 */
export const personaActions: Partial<ChatState> & ThisType<ChatState> = {
  async loadPersonas() {
    try {
      const res = await apiFetch("/api/personas",);
      if (res.ok) { this._personas = await res.json(); }
    } catch {
      /* ignore */
    }
  },

  async setPersona() {
    if (!this.activeChat) { return; }
    try {
      await apiFetch(`/api/v1/chats/${this.activeChat}/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ personaId: this._selectedPersonaId, },),
      },);
    } catch {
      /* non-critical */
    }
  },

  async toggleImpersonation() {
    if (!this.activeChat) { return; }
    const actorId = this._impersonatingActorId;
    try {
      if (actorId && this.impersonationActive) {
        await apiFetch(`/api/v1/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: actorId, },),
        },);
      } else {
        await apiFetch(`/api/v1/chats/${this.activeChat}/impersonate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ impersonateActorId: null, },),
        },);
      }
    } catch {
      /* non-critical */
    }
  },

  async loadImpersonationState() {
    if (!this.activeChat || this._impersonationLoaded) { return; }
    this._impersonationLoaded = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
      if (res.ok) {
        const participants = await res.json();
        const me = Array.isArray(participants,)
          ? participants.find((p: any,) => p.role_in_chat === "owner")
          : null;
        if (me) {
          this._selectedPersonaId = me.persona_id || null;
          this._impersonatingActorId = me.impersonate_actor_id || null;
          this.impersonationActive = !!me.impersonate_actor_id;
        }
      }
    } catch {
      /* ignore */
    }
    await this.loadPersonas();
  },
};
