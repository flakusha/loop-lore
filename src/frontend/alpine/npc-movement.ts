// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC movement indicator methods for the chat page.
 *
 * Implements the ChatMovementState slice (movementEvents, loadMovementEvents,
 * getMovementIcon) against GET /api/v1/npc-movement/recent/:chatId. Events
 * are produced by the auto-gen store path (store-npc-movement.ts) when the
 * narration classifies as a location change. Methods are merged into the
 * chatMessages object at call time, so `this` still resolves to the full
 * ChatState.
 */
import type { ChatState, MovementEvent, } from "./types";

/** Max chips kept for the message-list header strip (route default is 20). */
const NPC_MOVEMENT_MAX = 8;

export const npcMovementMethods: Partial<ChatState> & ThisType<ChatState> = {
  /** */
  movementEvents: [] as MovementEvent[],

  /** */
  loadingMovementEvents: false,

  /**
   * Load recent NPC movement events for the active chat.
   * @returns {Promise<void>}
   */
  async loadMovementEvents() {
    if (!this.activeChat) { return; }
    this.loadingMovementEvents = true;
    try {
      const res = await apiFetch(`/api/v1/npc-movement/recent/${this.activeChat}`,);
      if (!res.ok) { return; }
      const events = (await res.json()) as MovementEvent[];
      this.movementEvents = Array.isArray(events,) ? events.slice(-NPC_MOVEMENT_MAX,) : [];
    } catch {
      // non-critical
    } finally {
      this.loadingMovementEvents = false;
    }
  },

  /**
   * Display name for a movement event's actor (participant display_name when
   * loaded, else a truncated id fallback).
   * @param {string} actorId
   * @returns {string}
   */
  npcMovementActorName(actorId: string,) {
    const participant = this._participants.find((p,) => p.actor_id === actorId);
    return participant?.display_name || actorId.slice(0, 8,);
  },

  /**
   * Icon for a movement event: model-inferred moves get a compass, explicit
   * movement verbs get footprints, anything else a pin.
   * @param {string} pattern - Classification source recorded on the event
   * @returns {string}
   */
  getMovementIcon(pattern: string,) {
    if (pattern === "aux-llm") { return "🧭"; }
    if (pattern === "regex") { return "👣"; }
    return "📍";
  },
};
