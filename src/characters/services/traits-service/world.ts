/**
 * Traits Service — world trait dispatchers (Layer 2)
 */
import { randomUUID, } from "node:crypto";
import { guardNotExists, } from "../shared-service-utils";
import type {
  CreateWorldTraitOpts,
  TraitsContext,
  UpdateWorldTraitOpts,
  WorldTraitRow,
} from "./types";

/** Args for {@link getWorldTraits}. */
export interface GetWorldTraitsArgs {
  thisL: TraitsContext;
  actorId: string;
  worldId: string;
}

/**
 * Get all world traits for a character in a specific world.
 */
export async function getWorldTraits(
  { thisL, actorId, worldId, }: GetWorldTraitsArgs,
): Promise<WorldTraitRow[]> {
  return thisL.db
    .selectFrom("character_world_traits",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .selectAll()
    .execute();
}

/** Args for {@link getWorldTrait}. */
export interface GetWorldTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  worldId: string;
  name: string;
}

/**
 * Get a world trait by name.
 */
export async function getWorldTrait(
  { thisL, actorId, worldId, name, }: GetWorldTraitArgs,
): Promise<WorldTraitRow | undefined> {
  return thisL.db
    .selectFrom("character_world_traits",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("trait_name", "=", name,)
    .selectAll()
    .executeTakeFirst();
}

/** Args for {@link createWorldTrait}. */
export interface CreateWorldTraitArgs {
  thisL: TraitsContext;
  opts: CreateWorldTraitOpts;
}

/**
 * Create a world trait.
 * @throws If trait already exists for this actor+world
 */
export async function createWorldTrait(
  { thisL, opts, }: CreateWorldTraitArgs,
): Promise<string> {
  const existing = await getWorldTrait({
    thisL,
    actorId: opts.actorId,
    worldId: opts.worldId,
    name: opts.name,
  },);
  guardNotExists(existing, "World trait", `${opts.actorId}:${opts.worldId}:${opts.name}`,);

  const id = randomUUID();
  const now = new Date().toISOString();

  await thisL.db
    .insertInto("character_world_traits",)
    .values({
      id,
      actor_id: opts.actorId,
      world_id: opts.worldId,
      trait_category: opts.category as never,
      trait_name: opts.name,
      trait_value: opts.value,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return id;
}

/** Args for {@link updateWorldTrait}. */
export interface UpdateWorldTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  worldId: string;
  opts: UpdateWorldTraitOpts;
}

/**
 * Update a world trait value.
 */
export async function updateWorldTrait(
  { thisL, actorId, worldId, opts, }: UpdateWorldTraitArgs,
): Promise<void> {
  const existing = await getWorldTrait({ thisL, actorId, worldId, name: opts.name, },);
  if (!existing) {
    throw new Error(`World trait "${opts.name}" not found for actor ${actorId} in world ${worldId}`,);
  }

  await thisL.db
    .updateTable("character_world_traits",)
    .set({
      trait_value: opts.value,
      updated_at: new Date().toISOString(),
    },)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("trait_name", "=", opts.name,)
    .execute();
}

/** Args for {@link deleteWorldTrait}. */
export interface DeleteWorldTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  worldId: string;
  name: string;
}

/**
 * Delete a world trait.
 */
export async function deleteWorldTrait(
  { thisL, actorId, worldId, name, }: DeleteWorldTraitArgs,
): Promise<void> {
  await thisL.db
    .deleteFrom("character_world_traits",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "=", worldId,)
    .where("trait_name", "=", name,)
    .execute();
}
