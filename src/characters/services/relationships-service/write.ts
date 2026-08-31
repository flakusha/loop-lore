// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Relationships Service — write dispatchers
 * (createRelationship, updateRelationship, deleteRelationship)
 */
import { randomUUID, } from "node:crypto";
import { jsonStringifyOr, } from "../../../utils";
import { guardNotExists, withWorldId, } from "../shared-service-utils";
import { getRelationship, } from "./read";
import type {
  CreateRelationshipOpts,
  RelationshipsContext,
  UpdateRelationshipOpts,
} from "./types";

/** Args for {@link createRelationship}. */
export interface CreateRelationshipArgs {
  thisL: RelationshipsContext;
  opts: CreateRelationshipOpts;
}

/**
 * Create a relationship.
 * @param root0
 * @param root0.thisL
 * @param root0.opts
 * @throws If relationship already exists
 */
export async function createRelationship(
  { thisL, opts, }: CreateRelationshipArgs,
): Promise<string> {
  const existing = await getRelationship({
    thisL,
    actorId: opts.actorId,
    targetActorId: opts.targetActorId,
    worldId: opts.worldId,
  },);
  guardNotExists(existing, "Relationship", `${opts.actorId}->${opts.targetActorId}`,);

  const id = randomUUID();
  const now = new Date().toISOString();

  await thisL.db
    .insertInto("character_relationships",)
    .values({
      id,
      actor_id: opts.actorId,
      target_actor_id: opts.targetActorId,
      world_id: opts.worldId ?? null,
      relationship_type: opts.relationshipType,
      standing: opts.standing ?? 0,
      trust: opts.trust ?? 0,
      familiarity: opts.familiarity ?? 0,
      is_bidirectional: opts.isBidirectional ? 1 : 0,
      metadata: jsonStringifyOr(opts.metadata ?? {},),
      created_at: now,
      updated_at: now,
    },)
    .execute();

  // Create reverse relationship if bidirectional
  if (opts.isBidirectional) {
    await thisL.db
      .insertInto("character_relationships",)
      .values({
        id: randomUUID(),
        actor_id: opts.targetActorId,
        target_actor_id: opts.actorId,
        world_id: opts.worldId ?? null,
        relationship_type: opts.relationshipType,
        standing: opts.standing ?? 0,
        trust: opts.trust ?? 0,
        familiarity: opts.familiarity ?? 0,
        is_bidirectional: 1,
        metadata: jsonStringifyOr(opts.metadata ?? {},),
        created_at: now,
        updated_at: now,
      },)
      .execute();
  }

  return id;
}

/** Args for {@link updateRelationship}. */
export interface UpdateRelationshipArgs {
  thisL: RelationshipsContext;
  actorId: string;
  targetActorId: string;
  worldId: string | undefined;
  opts: UpdateRelationshipOpts;
}

/**
 * Update a relationship.
 * @param root0
 * @param root0.thisL
 * @param root0.actorId
 * @param root0.targetActorId
 * @param root0.worldId
 * @param root0.opts
 */
export async function updateRelationship(
  { thisL, actorId, targetActorId, worldId, opts, }: UpdateRelationshipArgs,
): Promise<void> {
  const existing = await getRelationship({
    thisL,
    actorId,
    targetActorId,
    worldId,
  },);
  if (!existing) {
    throw new Error(
      `Relationship not found between ${actorId} and ${targetActorId}`,
    );
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    updated_at: now,
  };

  if (opts.relationshipType !== undefined) {
    updateData.relationship_type = opts.relationshipType;
  }
  if (opts.standing !== undefined) {
    updateData.standing = Math.max(-100, Math.min(100, opts.standing,),);
  }
  if (opts.trust !== undefined) {
    updateData.trust = Math.max(-100, Math.min(100, opts.trust,),);
  }
  if (opts.familiarity !== undefined) {
    updateData.familiarity = Math.max(0, Math.min(100, opts.familiarity,),);
  }
  if (opts.metadata !== undefined) {
    updateData.metadata = jsonStringifyOr(opts.metadata,);
  }

  await withWorldId(
    thisL.db.updateTable("character_relationships",)
      .set(updateData,)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,),
    worldId,
  ).execute();

  // Update reverse if bidirectional
  if (existing.isBidirectional) {
    await withWorldId(
      thisL.db.updateTable("character_relationships",)
        .set(updateData,)
        .where("actor_id", "=", targetActorId,)
        .where("target_actor_id", "=", actorId,),
      worldId,
    ).execute();
  }
}

/** Args for {@link deleteRelationship}. */
export interface DeleteRelationshipArgs {
  thisL: RelationshipsContext;
  actorId: string;
  targetActorId: string;
  worldId?: string;
}

/**
 * Delete a relationship.
 * @param root0
 * @param root0.thisL
 * @param root0.actorId
 * @param root0.targetActorId
 * @param root0.worldId
 */
export async function deleteRelationship(
  { thisL, actorId, targetActorId, worldId, }: DeleteRelationshipArgs,
): Promise<void> {
  const existing = await getRelationship({
    thisL,
    actorId,
    targetActorId,
    worldId,
  },);
  if (!existing) {
    throw new Error(
      `Relationship not found between ${actorId} and ${targetActorId}`,
    );
  }

  await withWorldId(
    thisL.db.deleteFrom("character_relationships",)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,),
    worldId,
  ).execute();

  // Delete reverse if bidirectional
  if (existing.isBidirectional) {
    await withWorldId(
      thisL.db.deleteFrom("character_relationships",)
        .where("actor_id", "=", targetActorId,)
        .where("target_actor_id", "=", actorId,),
      worldId,
    ).execute();
  }
}
