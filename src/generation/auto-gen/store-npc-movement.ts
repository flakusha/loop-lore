// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Post-store NPC movement indicator step for auto-generation.
 *
 * Classifies the stored narration and persists a movement event on the
 * message's metadata when it signals a location change (consumed by the
 * message-list header strip via GET /npc-movement/recent/:chatId).
 * Strictly non-fatal — indicator failures must never break message storage.
 */
import type { Kysely, } from "kysely";
import { NpcMovementIndicatorService, } from "../../chat/npc-movement";
import { classifyTransition, } from "../../chat/transition-classifier";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";

/** */
export interface StoreNpcMovementOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  actorId: string;
  messageId: string;
  /** Stored narration (raw LLM content). */
  content: string;
}

/**
 * Record a movement event when the narration classifies as a location change.
 *
 * Mirrors the game-state extraction boundary in store-message.ts: every
 * failure is logged and swallowed so the generation path never throws.
 *
 * @param opts
 * @returns {Promise<void>}
 */
export async function storeNpcMovement(opts: StoreNpcMovementOpts,): Promise<void> {
  try {
    const classification = await classifyTransition(
      opts.content,
      [],
      opts.config,
      opts.database,
    );

    if (!classification.isTransition || classification.type !== "location_change") { return; }

    await new NpcMovementIndicatorService(opts.database,).storeMovementEvents(opts.messageId, [
      {
        actorId: opts.actorId,
        // No authoritative from/to ids here — the chat's current location is
        // owned by the user-message scene-transition path. Record the
        // classifier's location hint as the destination.
        fromLocationId: "",
        toLocationId: classification.locationHint ?? "",
        pattern: classification.source,
        timestamp: new Date().toISOString(),
      },
    ],);
  } catch (error) {
    getLogger().warn("npc-movement: failed to record movement event after message store", {
      chatId: opts.chatId,
      messageId: opts.messageId,
      error: error instanceof Error ? error.message : String(error,),
    },);
  }
}
