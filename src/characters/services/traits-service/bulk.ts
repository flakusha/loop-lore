// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Traits Service — bulk dispatchers
 */
import { getLocationTraits, } from "./location";
import { getPermanentTraits, } from "./permanent";
import type {
  LocationTraitRow,
  PermanentTraitRow,
  TraitsContext,
  WorldTraitRow,
} from "./types";
import { getWorldTraits, } from "./world";

/** Args for {@link getAllTraits}. */
export interface GetAllTraitsArgs {
  thisL: TraitsContext;
  actorId: string;
  worldId?: string;
  locationId?: string;
}

/**
 * Get all traits for a character across all layers.
 */
export async function getAllTraits(
  { thisL, actorId, worldId, locationId, }: GetAllTraitsArgs,
): Promise<{
  permanent: PermanentTraitRow[];
  world: WorldTraitRow[];
  location: LocationTraitRow[];
}> {
  const permanent = await getPermanentTraits({ thisL, actorId, },);

  const world = worldId
    ? await getWorldTraits({ thisL, actorId, worldId, },)
    : [];

  const location = locationId
    ? await getLocationTraits({ thisL, actorId, locationId, },)
    : [];

  return { permanent, world, location, };
}
