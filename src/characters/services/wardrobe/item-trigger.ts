// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import {
  allowAllOutfitChangeGate,
  type OutfitChangeGate,
  OutfitChangeInitiator,
  requestOutfitChange,
} from "./change-gate";

export async function triggerItemOutfitChange(
  db: Kysely<DB>,
  actorId: string,
  itemInstanceId: string,
  gate: OutfitChangeGate = allowAllOutfitChangeGate,
): Promise<void> {
  try {
    const binding = await db
      .selectFrom("actor_wardrobe",)
      .select(["wardrobe_item_id",],)
      .where("actor_id", "=", actorId,)
      .where("item_instance_id", "=", itemInstanceId,)
      .executeTakeFirst();

    if (!binding) { return; }

    await requestOutfitChange(
      {
        actorId,
        fromOutfitId: binding.wardrobe_item_id,
        toOutfitId: null,
        initiator: OutfitChangeInitiator.Item,
      },
      gate,
    );
  } catch (err) {
    try {
      getLogger().error("item outfit trigger failed", err instanceof Error ? err : new Error(String(err,),), {
        actorId,
        itemInstanceId,
      },);
    } catch { /* logger not initialized */ }
  }
}
