// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared guard for wardrobe routes that address one of an actor's items
 * (`/actors/:actorId/wardrobe/:itemId/...`).
 *
 * Collapses the copy-pasted four-step preamble — requireActorAccess →
 * Response short-circuit → param destructure → item load + 404 — into one
 * call, so the ownership and existence checks cannot drift per route.
 */
import { getWardrobeItem, } from "../characters/services/wardrobe/crud";
import type { WardrobeItem, } from "../characters/services/wardrobe/types";
import type { ActorAccessContext, HandlerOpts, } from "./actor-auth";
import { requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonError, } from "./http-utils";

/** Minimal context shape: an item route param plus the optional auth props. */
interface ItemAccessContext extends ActorAccessContext {
  params: { actorId: string; itemId: string };
}

/** One wardrobe item owned by the requesting user. */
export interface OwnedWardrobeItem {
  userId: string;
  actorId: string;
  itemId: string;
  item: WardrobeItem;
}

/**
 * Require actor ownership and that the addressed wardrobe item exists and is
 * visible to the actor (personal item or world template).
 * @param ctx - Elysia handler context carrying `params.actorId` + `params.itemId`
 * @param opts - database handle used for the ownership + item lookup
 * @returns the resolved ids and item, or a Response to short-circuit the handler
 */
export async function requireOwnedWardrobeItem(
  ctx: ItemAccessContext,
  { database, }: HandlerOpts,
): Promise<Response | OwnedWardrobeItem> {
  const userId = await requireActorAccess(ctx, database,);
  if (userId instanceof Response) { return userId; }

  const { actorId, itemId, } = ctx.params;
  const item = await getWardrobeItem(database, itemId, actorId,);
  if (!item) {
    return jsonError({ message: "Wardrobe item not found", status: HttpStatus.NotFound, },);
  }
  return { userId, actorId, itemId, item, };
}
