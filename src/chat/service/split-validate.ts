// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Branch-spec validation for party split (C7 — auto-execution slice).
 *
 * `splitParty` accepts caller-authored branch specs from two surfaces (the
 * REST route and the `/split` command). Before any write, every spec must
 * resolve against the chat's own world and participant list — otherwise the
 * insert path surfaces raw FK errors instead of a `ServiceError`, and a
 * typo'd actor id silently no-ops (`createBranchChat` inserts participant
 * rows without checking them).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { SplitBranch, } from "./split";
import type { ServiceError, } from "./types";

/** Options for {@link validateBranchSpecs}. */
export interface BranchSpecOptions {
  /** The chat's `world_id` — every branch destination must belong to it. */
  worldId: string | null;
  /** Branch specs exactly as passed to `splitParty`. */
  branches: SplitBranch[];
  /** The chat being split — every branch actor must be its participant. */
  chatId: string;
}

/** `ok: true` when every branch spec is valid, else the first `ServiceError`. */
export type BranchSpecValidation = { ok: true } | ServiceError;

/**
 * Validate split branch specs against the chat's world and participants.
 *
 * Checks, cheapest first: every branch carries at least one actor (the write
 * path silently skips empty ones, which would lose a whole group); the chat
 * has a world (destinations cannot be scoped without one); every
 * `locationId` exists in that world; every `actorId` is a current
 * participant of the chat.
 * @param database - Kysely instance
 * @param options - Chat world, branch specs, and the chat id
 * @returns `{ ok: true }` or a `bad_request` `ServiceError` with a precise message
 */
export async function validateBranchSpecs(
  database: Kysely<DB>,
  { worldId, branches, chatId, }: BranchSpecOptions,
): Promise<BranchSpecValidation> {
  for (const [index, branch,] of branches.entries()) {
    if (branch.actorIds.length === 0) {
      return {
        code: "bad_request",
        message: `Branch ${index + 1}${branch.name ? ` (${branch.name})` : ""} has no actors`,
      };
    }
  }

  if (!worldId) {
    return {
      code: "bad_request",
      message: "Chat has no world assigned; branch destinations require one",
    };
  }

  const locationIds = Array.from(new Set(Array.from(branches, b => b.locationId,),),);
  const foundLocations = await database
    .selectFrom("locations",)
    .select("id",)
    .where("id", "in", locationIds,)
    .where("world_id", "=", worldId,)
    .execute();

  const foundLocationIds = new Set(Array.from(foundLocations, row => row.id,),);
  const missingLocations = locationIds.filter(id => !foundLocationIds.has(id,));
  if (missingLocations.length > 0) {
    return {
      code: "bad_request",
      message: `Locations not found in this chat's world: ${missingLocations.join(", ",)}`,
    };
  }

  const actorIds = Array.from(new Set(branches.flatMap(branch => branch.actorIds),),);
  const participants = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "in", actorIds,)
    .execute();

  const participantIds = new Set(Array.from(participants, row => row.actor_id,),);
  const unknownActors = actorIds.filter(id => !participantIds.has(id,));
  if (unknownActors.length > 0) {
    return {
      code: "bad_request",
      message: `Actors are not participants of this chat: ${unknownActors.join(", ",)}`,
    };
  }

  return { ok: true, };
}
