// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Relationships Service — read dispatchers (getRelationships, getRelationship)
 */
import { withWorldId, } from "../shared-service-utils";
import { rowToRelationship, } from "./serialize";
import type { Relationship, RelationshipsContext, } from "./types";

/** Args for {@link getRelationships}. */
export interface GetRelationshipsArgs {
  thisL: RelationshipsContext;
  actorId: string;
  worldId?: string;
}

/**
 * Get all relationships for a character.
 */
export async function getRelationships(
  { thisL, actorId, worldId, }: GetRelationshipsArgs,
): Promise<Relationship[]> {
  const rows = await withWorldId(
    thisL.db.selectFrom("character_relationships",).where("actor_id", "=", actorId,),
    worldId,
  )
    .selectAll()
    .execute();

  return Array.from(rows, (row,) => rowToRelationship(row,),);
}

/** Args for {@link getRelationship}. */
export interface GetRelationshipArgs {
  thisL: RelationshipsContext;
  actorId: string;
  targetActorId: string;
  worldId?: string;
}

/**
 * Get relationship between two characters.
 */
export async function getRelationship(
  { thisL, actorId, targetActorId, worldId, }: GetRelationshipArgs,
): Promise<Relationship | undefined> {
  const row = await withWorldId(
    thisL.db.selectFrom("character_relationships",)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,),
    worldId,
  )
    .selectAll()
    .executeTakeFirst();

  return row ? rowToRelationship(row,) : undefined;
}
