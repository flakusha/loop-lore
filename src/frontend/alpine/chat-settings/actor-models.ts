// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, GmConfig, } from "../types";

/**
 * Per-actor model overrides for the chat settings modal. Mixed into
 * `chatSettings` so they run with full `ChatState` context.
 */
export const actorModelActions: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * @param {GmConfig} config
   * @returns {void}
   */
  loadActorModels(config: GmConfig,): void {
    const actorModels: Record<string, { model: string; provider: string }> = {};
    for (const p of this._chatParticipants) {
      actorModels[p.actor_id] = config.actorModels?.[p.actor_id] ?? { model: "", provider: "", };
    }

    this._actorModels = actorModels;
  },

  /**
   * Participants paired with their per-actor model slot. The settings modal is
   * rendered (hidden) from page init, so a participant the chat payload
   * carried no override for has no entry yet — the slot is created on read so
   * `x-model` always binds to an existing object.
   */
  get _actorModelRows(): { actor_id: string; label: string; slot: { model: string; provider: string } }[] {
    return (this._chatParticipants ?? []).map((p,) => {
      this._actorModels[p.actor_id] ??= { model: "", provider: "", };
      return { actor_id: p.actor_id, label: p.display_name || p.name, slot: this._actorModels[p.actor_id]!, };
    },);
  },
};
