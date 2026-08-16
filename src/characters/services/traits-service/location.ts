// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Traits Service — location trait dispatchers (Layer 3)
 */
import { randomUUID, } from "node:crypto";
import { jsonStringifyOr, } from "../../../utils";
import { guardNotExists, } from "../shared-service-utils";
import type {
  CreateLocationTraitOpts,
  LocationTraitRow,
  TraitsContext,
  UpdateLocationTraitOpts,
} from "./types";

/** Args for {@link getLocationTraits}. */
export interface GetLocationTraitsArgs {
  thisL: TraitsContext;
  actorId: string;
  locationId: string;
}

/**
 * Get all location traits for a character at a specific location.
 */
export async function getLocationTraits(
  { thisL, actorId, locationId, }: GetLocationTraitsArgs,
): Promise<LocationTraitRow[]> {
  return thisL.db
    .selectFrom("character_location_traits",)
    .where("actor_id", "=", actorId,)
    .where("location_id", "=", locationId,)
    .selectAll()
    .execute();
}

/** Args for {@link getLocationTrait}. */
export interface GetLocationTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  locationId: string;
  name: string;
}

/**
 * Get a location trait by name.
 */
export async function getLocationTrait(
  { thisL, actorId, locationId, name, }: GetLocationTraitArgs,
): Promise<LocationTraitRow | undefined> {
  return thisL.db
    .selectFrom("character_location_traits",)
    .where("actor_id", "=", actorId,)
    .where("location_id", "=", locationId,)
    .where("trait_name", "=", name,)
    .selectAll()
    .executeTakeFirst();
}

/** Args for {@link createLocationTrait}. */
export interface CreateLocationTraitArgs {
  thisL: TraitsContext;
  opts: CreateLocationTraitOpts;
}

/**
 * Create a location trait.
 * @throws If trait already exists for this actor+location
 */
export async function createLocationTrait(
  { thisL, opts, }: CreateLocationTraitArgs,
): Promise<string> {
  const existing = await getLocationTrait({
    thisL,
    actorId: opts.actorId,
    locationId: opts.locationId,
    name: opts.name,
  },);
  guardNotExists(existing, "Location trait", `${opts.actorId}:${opts.locationId}:${opts.name}`,);

  const id = randomUUID();
  const now = new Date().toISOString();

  await thisL.db
    .insertInto("character_location_traits",)
    .values({
      id,
      actor_id: opts.actorId,
      location_id: opts.locationId,
      trait_name: opts.name,
      trait_value: opts.value,
      bonus: opts.bonus ?? 0,
      penalty: opts.penalty ?? 0,
      effects: jsonStringifyOr(opts.effects ?? {},),
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return id;
}

/** Args for {@link updateLocationTrait}. */
export interface UpdateLocationTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  locationId: string;
  opts: UpdateLocationTraitOpts;
}

/**
 * Update a location trait.
 */
export async function updateLocationTrait(
  { thisL, actorId, locationId, opts, }: UpdateLocationTraitArgs,
): Promise<void> {
  const existing = await getLocationTrait({ thisL, actorId, locationId, name: opts.name, },);
  if (!existing) {
    throw new Error(`Location trait "${opts.name}" not found for actor ${actorId} at location ${locationId}`,);
  }

  await thisL.db
    .updateTable("character_location_traits",)
    .set({
      trait_value: opts.value,
      bonus: opts.bonus ?? existing.bonus,
      penalty: opts.penalty ?? existing.penalty,
      effects: opts.effects ? jsonStringifyOr(opts.effects,) : existing.effects,
      updated_at: new Date().toISOString(),
    },)
    .where("actor_id", "=", actorId,)
    .where("location_id", "=", locationId,)
    .where("trait_name", "=", opts.name,)
    .execute();
}

/** Args for {@link deleteLocationTrait}. */
export interface DeleteLocationTraitArgs {
  thisL: TraitsContext;
  actorId: string;
  locationId: string;
  name: string;
}

/**
 * Delete a location trait.
 */
export async function deleteLocationTrait(
  { thisL, actorId, locationId, name, }: DeleteLocationTraitArgs,
): Promise<void> {
  await thisL.db
    .deleteFrom("character_location_traits",)
    .where("actor_id", "=", actorId,)
    .where("location_id", "=", locationId,)
    .where("trait_name", "=", name,)
    .execute();
}
