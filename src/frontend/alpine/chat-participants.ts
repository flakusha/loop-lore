// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatParticipant, ChatParticipantsState, } from "./chat-types/participants-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

/**
 * Group-Chat Participant Panel (C1 — chat-type matrix UI remainder).
 *
 * Manages the participant sidebar for group chats: list, add, remove, and
 * adjust talkativity/initiative. Backed by the existing participants REST API.
 * `loadParticipants()` also refreshes `_chatParticipants` so @mention
 * autocomplete stays in sync.
 */
export const chatParticipants: Partial<ChatParticipantsState> & ThisType<ChatState> = {
  _participants: [] as ChatParticipant[],
  _availableActors: [] as { id: string; display_name: string; actor_type: string }[],
  _participantQuery: "",
  _participantsBusy: false,
  _selectedAddActorId: null as string | null,
  _selectedAddRole: "member",

  get isGroupChat(): boolean {
    return this.currentChat?.type === "group";
  },

  get filteredAvailableActors(): { id: string; display_name: string; actor_type: string }[] {
    const memberIds = new Set<string>();
    for (const p of this._participants) { memberIds.add(p.actor_id,); }
    const q = (this._participantQuery || "").toLowerCase();
    const out: { id: string; display_name: string; actor_type: string }[] = [];
    for (const a of this._availableActors) {
      if (memberIds.has(a.id,)) { continue; }
      if (q && !(a.display_name || "").toLowerCase().includes(q,)) { continue; }
      out.push(a,);
    }
    return out;
  },

  async loadParticipants() {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`,);
      if (!res.ok) { return; }
      const participants = (await res.json()) as ChatParticipant[];
      this._participants = participants;
      // Keep @mention autocomplete source in sync (subset shape).
      this._chatParticipants = Array.from(participants, (p: ChatParticipant,) => {
        return {
          actor_id: p.actor_id,
          name: p.display_name,
          display_name: p.display_name,
          actor_type: p.actor_type,
        };
      },);
    } catch {
      /* ignore */
    }
  },

  async loadAvailableActors() {
    if (!this.activeChat || !this.isGroupChat) { return; }
    try {
      const res = await apiFetch("/api/actors",);
      if (!res.ok) { return; }
      const actors = (await res.json()) as { id: string; display_name: string; actor_type: string }[];
      this._availableActors = actors;
    } catch {
      /* ignore */
    }
  },

  async addParticipant(actorId: string, role = "member",) {
    if (!actorId || !this.activeChat) { return; }
    this._participantsBusy = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ actorId, role, },),
      },);
      if (res.ok) {
        this._selectedAddActorId = null;
        this._participantQuery = "";
        await this.loadParticipants();
        this.$dispatch?.("show-toast", { type: "success", message: t("participants.added",), },);
      } else {
        let errorMessage: string | undefined;
        try {
          const body = (await res.json()) as { error?: string };
          errorMessage = body.error;
        } catch { /* non-JSON error body */ }
        this.$dispatch?.("show-toast", {
          type: "error",
          message: errorMessage || t("participants.failedAdd",),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("participants.failedAdd",), },);
    } finally {
      this._participantsBusy = false;
    }
  },

  async removeParticipant(actorId: string,) {
    if (!actorId || !this.activeChat) { return; }
    this._participantsBusy = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants/${actorId}`, {
        method: "DELETE",
      },);
      if (res.ok || res.status === 204) {
        await this.loadParticipants();
        this.$dispatch?.("show-toast", { type: "success", message: t("participants.removed",), },);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("participants.failedRemove",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("participants.failedRemove",), },);
    } finally {
      this._participantsBusy = false;
    }
  },

  async updateParticipantTalkativity(actorId: string, value: number,) {
    if (!actorId || !this.activeChat) { return; }
    const clamped = Math.min(10, Math.max(1, Math.round(value,),),);
    const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants/${actorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ talkativity: clamped, },),
    },);
    if (res.ok) {
      const p = this._participants.find((x,) => x.actor_id === actorId);
      if (p) { p.talkativity = clamped; }
    } else {
      this.$dispatch?.("show-toast", { type: "error", message: t("participants.failedUpdate",), },);
    }
  },

  async updateParticipantInitiative(actorId: string, value: number,) {
    if (!actorId || !this.activeChat) { return; }
    const res = await apiFetch(`/api/v1/chats/${this.activeChat}/participants/${actorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ initiative: value, },),
    },);
    if (res.ok) {
      const p = this._participants.find((x,) => x.actor_id === actorId);
      if (p) { p.initiative = value; }
    } else {
      this.$dispatch?.("show-toast", { type: "error", message: t("participants.failedUpdate",), },);
    }
  },
};
