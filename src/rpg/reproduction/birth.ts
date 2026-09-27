// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { uid, } from "../utils";
import { getPregnancy, getPregnancyMeta, PREGNANCY_EFFECT, } from "./reproduction-store";

/**
 * Birth: removes the pregnancy row, creates the child actor, and
 * writes bidirectional `family` relationships (carrier→child,
 * child→carrier, sire→child when known) through the canonical
 * `character_relationships` model. Returns the child actor id, or null
 * when no active pregnancy exists.
 * @param db
 * @param characterId - the pregnant actor (carrier)
 * @param childName
 */
export async function birthChild(
  db: Kysely<DB>,
  characterId: string,
  childName: string,
): Promise<string | null> {
  const status = await getPregnancy(db, characterId,);
  if (!status.pregnant) { return null; }
  const meta = await getPregnancyMeta(db, characterId,);
  const log = getLogger().child({ module: "reproduction", },);
  const childId = uid();
  const now = new Date().toISOString();
  await db
    .insertInto("actors",)
    .values({
      id: childId,
      display_name: childName,
      created_at: now,
      updated_at: now,
    },)
    .execute();
  const link = async (from: string, to: string,): Promise<void> => {
    await db
      .insertInto("character_relationships",)
      .values({
        id: uid(),
        actor_id: from,
        target_actor_id: to,
        world_id: null,
        relationship_type: "family",
        created_at: now,
        updated_at: now,
      },)
      .execute();
  };
  await link(characterId, childId,);
  await link(childId, characterId,);
  if (meta.sireId) {
    await link(meta.sireId, childId,);
    await link(childId, meta.sireId,);
  }
  await db
    .deleteFrom("status_effect",)
    .where("actor_id", "=", characterId,)
    .where("effect_id", "=", PREGNANCY_EFFECT,)
    .where("category", "=", "pregnancy",)
    .execute();
  log.info(`Birth: child ${childId} (${childName}) to carrier ${characterId}`,);
  return childId;
}
