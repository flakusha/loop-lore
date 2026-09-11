// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — share handlers (extracted from ./handlers.ts).
 * Re-exported through ./handlers so existing importers keep working.
 */
import {
  badRequestResponse,
  jsonCreated,
  jsonNoContent,
  jsonResponse,
  notOwnerResponse,
  requireUserId,
} from "../../routes/http-utils";
import { getAssetShares, shareAsset, unshareAsset, } from "../service";
import { requireAssetOwner, resolveAsset, } from "./access";
import type { RouteDeps, } from "./handlers";
import type { RouteCtx, } from "./types";
/**
 * @param root0
 * @param root0.database
 * @param root0.ctx
 */
export async function handleCreateShare({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const body = ctx.body as { actor_id?: string };
  if (!body.actor_id) {
    return badRequestResponse("actor_id is required",);
  }

  const share = await shareAsset({
    database,
    assetId: ctx.params.id!,
    sharedWithId: body.actor_id,
    sharedById: userId,
  },);
  if (!share) {
    return notOwnerResponse("Asset",);
  }
  return jsonCreated(share,);
}

/**
 * @param root0
 * @param root0.database
 * @param root0.ctx
 */
export async function handleDeleteShare({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const owned = await requireAssetOwner(database, ctx.params.id!, userId,);
  if (owned instanceof Response) { return owned; }

  const body = ctx.body as { actor_id?: string };
  if (!body.actor_id) {
    return badRequestResponse("actor_id is required",);
  }

  await unshareAsset({ database, assetId: ctx.params.id!, sharedWithId: body.actor_id, },);
  return jsonNoContent();
}

/**
 * @param root0
 * @param root0.database
 * @param root0.ctx
 */
export async function handleListShares({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const userRole = ctx.userRole ?? null;

  // Share lists reveal who an asset is shared with — owner/admin only.
  const resolved = await resolveAsset(database, ctx.params.id!, userId, userRole,);
  if (resolved instanceof Response) { return resolved; }

  const shares = await getAssetShares(database, ctx.params.id!,);
  return jsonResponse(shares,);
}
