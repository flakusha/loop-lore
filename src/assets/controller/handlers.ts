// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — per-route handler logic.
 * Each handler receives the shared route deps plus the Elysia request ctx.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { AssetLinkEntity, } from "../../db/enums";
import { AssetVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import {
  badRequestResponse,
  jsonCreated,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
  notFoundResponse,
  notOwnerResponse,
  requireUserId,
} from "../../routes/http-utils";
import {
  deleteAsset,
  getAssetLinks,
  getAssetShares,
  linkAsset,
  listAssets,
  shareAsset,
  unlinkAsset,
  unshareAsset,
  updateAssetVisibility,
} from "../service";
import { requireAssetOwner, resolveAsset, } from "./access";
import type { RouteCtx, } from "./types";

/** Shared route dependencies threaded into every handler. */
export interface RouteDeps {
  database: Kysely<DB>;
  config: Config;
}

export async function handleListAssets({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const searchParams = new URL(ctx.request.url,).searchParams;
  const page = Number(searchParams.get("page",) ?? "1",);
  const pageSize = Math.min(Number(searchParams.get("pageSize",) ?? "50",), 200,);
  const entityType = searchParams.get("entity_type",) ?? undefined;
  const entityId = searchParams.get("entity_id",) ?? undefined;
  const label = searchParams.get("label",) ?? undefined;
  const userId = ctx.userId ?? null;
  const userRole = ctx.userRole ?? null;

  const result = await listAssets(database, {
    page,
    pageSize,
    entityType: entityType as AssetLinkEntity,
    entityId,
    label,
    actorId: userId,
    actorRole: userRole,
  },);
  return jsonPaginated({ data: result.data, total: result.total, page, pageSize, },);
}

export async function handleGetAsset({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = ctx.userId ?? null;
  const userRole = ctx.userRole ?? null;
  const resolved = await resolveAsset(database, ctx.params.id!, userId, userRole,);
  if (resolved instanceof Response) { return resolved; }
  return jsonResponse(resolved.asset,);
}

export async function handlePatchAsset({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const body = ctx.body as { visibility?: string };
  if (
    !body.visibility ||
    ![AssetVisibility.Private, AssetVisibility.Shared, AssetVisibility.Public,].includes(
      body.visibility as AssetVisibility,
    )
  ) {
    return badRequestResponse("Invalid visibility. Must be private, shared, or public",);
  }

  const updated = await updateAssetVisibility({
    database,
    assetId: ctx.params.id!,
    visibility: body.visibility as AssetVisibility,
    actorId: userId,
  },);
  if (!updated) {
    return notOwnerResponse("Asset",);
  }
  return jsonResponse({ id: updated.id, visibility: updated.visibility, },);
}

export async function handleDeleteAsset({ database, config, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const owned = await requireAssetOwner(database, ctx.params.id!, userId,);
  if (owned instanceof Response) { return owned; }

  const deleted = await deleteAsset({
    database,
    assetId: ctx.params.id!,
    uploadDir: config.assets.uploadDir,
  },);
  if (!deleted) {
    return notFoundResponse("Asset not found",);
  }
  return jsonNoContent();
}

export async function handleListLinks({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const userRole = ctx.userRole ?? null;

  // Link metadata can reveal where an asset is used — same access gate as reading the asset.
  const resolved = await resolveAsset(database, ctx.params.id!, userId, userRole,);
  if (resolved instanceof Response) { return resolved; }

  const links = await getAssetLinks(database, ctx.params.id!,);
  return jsonResponse(links,);
}

export async function handleCreateLink({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const owned = await requireAssetOwner(database, ctx.params.id!, userId,);
  if (owned instanceof Response) { return owned; }

  const body = ctx.body as { entityType: AssetLinkEntity; entityId: string; label?: string };
  await linkAsset({
    database,
    assetId: ctx.params.id!,
    link: body,
  },);
  return jsonCreated({ id: ctx.params.id!, },);
}

export async function handleDeleteLink({ database, ctx, }: RouteDeps & { ctx: RouteCtx },): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const owned = await requireAssetOwner(database, ctx.params.id!, userId,);
  if (owned instanceof Response) { return owned; }

  const body = ctx.body as { entityType?: string; entityId?: string };
  if (!body.entityType || !body.entityId) {
    return badRequestResponse("entityType and entityId are required",);
  }
  await unlinkAsset({
    database,
    assetId: ctx.params.id!,
    entityType: body.entityType as AssetLinkEntity,
    entityId: body.entityId,
  },);
  return jsonNoContent();
}

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
