// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — resolve the `users.id` that must own a generated asset.
 *
 * Lives beside `persist-generated.ts` because it answers the one question
 * that contract cannot: which principal the caller has to hand it. Kept in
 * the assets service (a leaf that both the generation and characters layers
 * already import) so neither has to reach into the other.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Resolve the user that must own an asset generated for an actor.
 *
 * `assets.owner_id` references `users.id`, so the actor id is never a valid
 * owner: it trips the FK when no user holds that id, and silently hands the
 * asset to an unrelated user when one does. The owner is the actor row's
 * `owner_id` (owned characters) or `user_id` (the requester's own persona) —
 * the same pair `resolveActorAccess` (src/routes/actor-access.ts) treats as
 * ownership — so the asset owner and the `link.entityId` actor stay one
 * principal.
 * @param db
 * @param actorId
 * @returns The owning user id
 * @throws {Error} When the actor row is missing or has no owning user
 */
export async function resolveAssetOwnerId(db: Kysely<DB>, actorId: string,): Promise<string> {
  const actor = await db
    .selectFrom("actors",)
    .select(["owner_id", "user_id",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  const userId = actor?.owner_id ?? actor?.user_id ?? null;

  if (!userId) {
    throw new Error(`Actor ${actorId} has no owning user to own generated assets`,);
  }

  return userId;
}
