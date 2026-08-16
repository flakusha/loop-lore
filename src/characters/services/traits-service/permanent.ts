// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Traits Service — permanent trait dispatchers (Layer 0)
 */
import { randomUUID, } from "node:crypto";
import { guardNotExists, } from "../shared-service-utils";
import type {
  CreatePermanentTraitOpts,
  PermanentTraitRow,
  TraitsContext,
  UpdatePermanentTraitOpts,
} from "./types";

/** Args for {@link getPermanentTraits}. */
export interface GetPermanentTraitsArgs {
  thisL: TraitsContext;
  actorId: string;
}

/**
 * Get all permanent traits for a character.
 */
export async function getPermanentTraits(
  { thisL, actorId, }: GetPermanentTraitsArgs,
): Promise<PermanentTraitRow[]> {
  return thisL.db
    .selectFrom("character_permanent_traits",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .execute();
}

/** Args for {@link getPermanentTrait}. */
export interface GetPermanentTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  name: string;
}

/**
 * Get a permanent trait by name.
 */
export async function getPermanentTrait(
  { thisL, actorId, name, }: GetPermanentTraitArgs,
): Promise<PermanentTraitRow | undefined> {
  return thisL.db
    .selectFrom("character_permanent_traits",)
    .where("actor_id", "=", actorId,)
    .where("trait_name", "=", name,)
    .selectAll()
    .executeTakeFirst();
}

/** Args for {@link createPermanentTrait}. */
export interface CreatePermanentTraitArgs {
  thisL: TraitsContext;
  opts: CreatePermanentTraitOpts;
}

/**
 * Create a permanent trait.
 * @throws If trait already exists for this actor
 */
export async function createPermanentTrait(
  { thisL, opts, }: CreatePermanentTraitArgs,
): Promise<string> {
  const existing = await getPermanentTrait({ thisL, actorId: opts.actorId, name: opts.name, },);
  guardNotExists(existing, "Permanent trait", `${opts.actorId}:${opts.name}`,);

  const id = randomUUID();
  const now = new Date().toISOString();

  await thisL.db
    .insertInto("character_permanent_traits",)
    .values({
      id,
      actor_id: opts.actorId,
      trait_category: opts.category as never,
      trait_name: opts.name,
      trait_value: opts.value,
      immutable: 1,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return id;
}

/** Args for {@link updatePermanentTrait}. */
export interface UpdatePermanentTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  opts: UpdatePermanentTraitOpts;
}

/**
 * Update a permanent trait value.
 * @throws If trait doesn't exist
 */
export async function updatePermanentTrait(
  { thisL, actorId, opts, }: UpdatePermanentTraitArgs,
): Promise<void> {
  const existing = await getPermanentTrait({ thisL, actorId, name: opts.name, },);
  if (!existing) {
    throw new Error(`Permanent trait "${opts.name}" not found for actor ${actorId}`,);
  }

  await thisL.db
    .updateTable("character_permanent_traits",)
    .set({
      trait_value: opts.value,
      updated_at: new Date().toISOString(),
    },)
    .where("actor_id", "=", actorId,)
    .where("trait_name", "=", opts.name,)
    .execute();
}

/** Args for {@link deletePermanentTrait}. */
export interface DeletePermanentTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  name: string;
}

/**
 * Delete a permanent trait.
 */
export async function deletePermanentTrait(
  { thisL, actorId, name, }: DeletePermanentTraitArgs,
): Promise<void> {
  await thisL.db
    .deleteFrom("character_permanent_traits",)
    .where("actor_id", "=", actorId,)
    .where("trait_name", "=", name,)
    .execute();
}
