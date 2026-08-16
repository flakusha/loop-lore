// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { jsonStringifyOr, uid, } from "../../../utils.js";
import type {
  CreateLocationTraitInput,
  LocationTraitRow,
  UpdateLocationTraitInput,
} from "./types";

/** Create a location trait */
export async function createLocationTrait(
  db: Kysely<any>,
  input: CreateLocationTraitInput,
): Promise<LocationTraitRow> {
  const id = uid();
  const now = new Date().toISOString();
  const trait = {
    id,
    actor_id: input.actor_id,
    location_id: input.location_id,
    trait_name: input.trait_name,
    trait_value: input.trait_value,
    bonus: input.bonus ?? 0,
    penalty: input.penalty ?? 0,
    effects: jsonStringifyOr(input.effects ?? {},),
    equipment_override: jsonStringifyOr(input.equipment_override ?? {},),
    created_at: now,
    updated_at: now,
  };

  await db
    .insertInto("character_location_traits",)
    .values(trait,)
    .execute();

  return trait;
}

/** Get all location traits for an actor in a location */
export async function getLocationTraits(
  db: Kysely<any>,
  actorId: string,
  locationId: string,
): Promise<LocationTraitRow[]> {
  return db
    .selectFrom("character_location_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("location_id", "=", locationId,)
    .execute() as Promise<LocationTraitRow[]>;
}

/** Update a location trait */
export async function updateLocationTrait(
  db: Kysely<any>,
  id: string,
  input: UpdateLocationTraitInput,
): Promise<LocationTraitRow | undefined> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.trait_name !== undefined) { updates.trait_name = input.trait_name; }
  if (input.trait_value !== undefined) { updates.trait_value = input.trait_value; }
  if (input.bonus !== undefined) { updates.bonus = input.bonus; }
  if (input.penalty !== undefined) { updates.penalty = input.penalty; }
  if (input.effects !== undefined) {
    updates.effects = jsonStringifyOr(input.effects,);
  }
  if (input.equipment_override !== undefined) {
    updates.equipment_override = jsonStringifyOr(input.equipment_override,);
  }

  const result = await db
    .updateTable("character_location_traits",)
    .set(updates,)
    .where("id", "=", id,)
    .executeTakeFirst();

  if (Number(result?.numUpdatedRows ?? 0,) === 0) { return undefined; }

  return db
    .selectFrom("character_location_traits",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirst() as Promise<LocationTraitRow | undefined>;
}

/** Delete a location trait */
export async function deleteLocationTrait(db: Kysely<any>, id: string,): Promise<boolean> {
  const result = await db
    .deleteFrom("character_location_traits",)
    .where("id", "=", id,)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0,) > 0;
}
