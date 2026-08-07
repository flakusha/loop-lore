import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, uid, } from "../../../utils";
import { rowToDesireProfile, } from "./helpers";
import type { DesireProfile, } from "./types";

/**
 * Get or create a desire profile for an actor.
 */
export async function getDesireProfile(db: Kysely<DB>, actorId: string,): Promise<DesireProfile> {
  const row = await db
    .selectFrom("character_desire_profile",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();

  if (row) {
    return rowToDesireProfile(row,);
  }

  // Create default profile
  const now = new Date().toISOString();
  const id = uid();

  await db
    .insertInto("character_desire_profile",)
    .values({
      id,
      actor_id: actorId,
      turn_ons: "[]",
      turn_offs: "[]",
      fetishes: "[]",
      hard_limits: "[]",
      current_desire: 0,
      desire_decay_rate: 1,
      desire_buildup_rate: 1,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return {
    id,
    actorId,
    turnOns: [],
    turnOffs: [],
    fetishes: [],
    hardLimits: [],
    currentDesire: 0,
    desireDecayRate: 1,
    desireBuildupRate: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a desire profile.
 */
export async function updateDesireProfile(
  db: Kysely<DB>,
  actorId: string,
  updates: Partial<
    Pick<DesireProfile, "turnOns" | "turnOffs" | "fetishes" | "hardLimits" | "desireDecayRate" | "desireBuildupRate">
  >,
): Promise<boolean> {
  // Ensure profile exists
  await getDesireProfile(db, actorId,);

  const now = new Date().toISOString();
  const clause: Record<string, unknown> = { updated_at: now, };

  if (updates.turnOns !== undefined) { clause.turn_ons = jsonStringifyOr(updates.turnOns,); }
  if (updates.turnOffs !== undefined) { clause.turn_offs = jsonStringifyOr(updates.turnOffs,); }
  if (updates.fetishes !== undefined) { clause.fetishes = jsonStringifyOr(updates.fetishes,); }
  if (updates.hardLimits !== undefined) { clause.hard_limits = jsonStringifyOr(updates.hardLimits,); }
  if (updates.desireDecayRate !== undefined) { clause.desire_decay_rate = updates.desireDecayRate; }
  if (updates.desireBuildupRate !== undefined) { clause.desire_buildup_rate = updates.desireBuildupRate; }

  const result = await db
    .updateTable("character_desire_profile",)
    .set(clause,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  return (result.numUpdatedRows ?? 0n) > 0n;
}
