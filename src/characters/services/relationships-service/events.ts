// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Relationships Service — logEvent dispatcher
 */
import { getRelationship, } from "./read";
import type { LogRelationshipEventOpts, RelationshipsContext, UpdateRelationshipOpts, } from "./types";
import { updateRelationship, } from "./write";

/** Args for {@link logEvent}. */
export interface LogEventArgs {
  thisL: RelationshipsContext;
  opts: LogRelationshipEventOpts;
}

/**
 * Log a relationship event (applies standing/trust/familiarity changes).
 */
export async function logEvent(
  { thisL, opts, }: LogEventArgs,
): Promise<void> {
  const relationship = await getRelationship({
    thisL,
    actorId: opts.actorId,
    targetActorId: opts.targetActorId,
    worldId: opts.worldId,
  },);

  if (!relationship) {
    throw new Error(
      `Relationship not found between ${opts.actorId} and ${opts.targetActorId}`,
    );
  }

  // Apply deltas
  const updateOpts: UpdateRelationshipOpts = {};

  if (opts.standingDelta !== undefined) {
    updateOpts.standing = relationship.standing + opts.standingDelta;
  }
  if (opts.trustDelta !== undefined) {
    updateOpts.trust = relationship.trust + opts.trustDelta;
  }
  if (opts.familiarityDelta !== undefined) {
    updateOpts.familiarity = relationship.familiarity + opts.familiarityDelta;
  }
  if (opts.metadata !== undefined) {
    updateOpts.metadata = {
      ...relationship.metadata,
      ...opts.metadata,
      lastEvent: opts.eventType,
    };
  }

  await updateRelationship({
    thisL,
    actorId: opts.actorId,
    targetActorId: opts.targetActorId,
    worldId: opts.worldId,
    opts: updateOpts,
  },);
}
