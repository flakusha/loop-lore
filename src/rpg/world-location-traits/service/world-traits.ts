// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { uid, } from "../../../utils.js";
import type {
  CreateWorldTraitInput,
  UpdateWorldTraitInput,
  WorldTraitRow,
} from "./types";

/** Create a world trait */
export async function createWorldTrait(
  db: Kysely<any>,
  input: CreateWorldTraitInput,
): Promise<WorldTraitRow> {
  const id = uid();
  const now = new Date().toISOString();
  const trait = {
    id,
    actor_id: input.actor_id,
    world_id: input.world_id,
    trait_category: input.trait_category,
    trait_name: input.trait_name,
    trait_value: input.trait_value,
    created_at: now,
    updated_at: now,
  };

  await db
    .insertInto("character_world_traits",)
    .values(trait,)
    .execute();

  return trait;
}

/** Get all world traits for an actor in a world */
export async function getWorldTraits(
  db: Kysely<any>,
  actorId: string,
  worldId: string,
): Promise<WorldTraitRow[]> {
  return db
    .selectFrom("character_world_traits",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .orderBy("trait_category", "asc",)
    .execute() as Promise<WorldTraitRow[]>;
}

/** Update a world trait */
export async function updateWorldTrait(
  db: Kysely<any>,
  id: string,
  input: UpdateWorldTraitInput,
): Promise<WorldTraitRow | undefined> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.trait_category !== undefined) {
    updates.trait_category = input.trait_category;
  }
  if (input.trait_name !== undefined) { updates.trait_name = input.trait_name; }
  if (input.trait_value !== undefined) { updates.trait_value = input.trait_value; }

  const result = await db
    .updateTable("character_world_traits",)
    .set(updates,)
    .where("id", "=", id,)
    .executeTakeFirst();

  if (Number(result?.numUpdatedRows ?? 0,) === 0) { return undefined; }

  return db
    .selectFrom("character_world_traits",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirst() as Promise<WorldTraitRow | undefined>;
}

/** Delete a world trait */
export async function deleteWorldTrait(db: Kysely<any>, id: string,): Promise<boolean> {
  const result = await db
    .deleteFrom("character_world_traits",)
    .where("id", "=", id,)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0,) > 0;
}
