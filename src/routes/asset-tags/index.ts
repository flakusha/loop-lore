// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 296
/**
 * Asset tag routes (gallery tagging G7).
 *
 *   GET    /api/assets/:id/tags              — list visible tags (global + own user)
 *   POST   /api/assets/:id/tags              — add a tag
 *   DELETE /api/assets/:id/tags              — remove a tag
 *   POST   /api/assets/:id/tags/rename       — rename a tag
 *   GET    /api/assets/:id/tag-propositions  — propose tags from metadata
 *   DELETE /api/assets/:id/tag-propositions  — dismiss a proposed tag
 *   GET    /api/tag-autocomplete             — distinct tag vocabulary (?q= prefix)
 *
 * Ownership:
 *   - `user`-scope tags are owned by the caller (`owner_id = userId`).
 *   - `global`-scope tags are curated by the asset owner or a role holding
 *     the `admin.character` override.
 */
import { Elysia, t, } from "elysia";
import { getAsset, } from "../../assets/service";
import {
  dismissProposition,
  proposeTags,
} from "../../assets/service/tag-propositions";
import {
  addAssetTag,
  listAssetTags,
  removeAssetTag,
  renameAssetTag,
  tagVocabulary,
} from "../../assets/service/tags";
import { AssetTagScope, } from "../../db/enums";
import {
  AddAssetTagBody,
  AssetTagListResponse,
  AssetTagResponse,
  DismissTagPropositionBody,
  ErrorResponse,
  RemoveAssetTagBody,
  RenameAssetTagBody,
  TagAutocompleteResponse,
  TagPropositionListResponse,
} from "../../validation/schemas";
import {
  badRequestResponse,
  forbiddenResponse,
  jsonNoContent,
  jsonResponse,
  notFoundResponse,
  requireUserId,
} from "../http-utils";
import { AssetIdParams, canCurateGlobal, resolveAccessibleAsset, } from "./helpers";
import type { AuthContext, HandlerOpts, } from "./types";

export type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function assetTagRoutes(opts: HandlerOpts, prefix = "/api",): Elysia {
  const { database, } = opts;

  return new Elysia({ name: "asset-tags", },)
    // ── List ─────────────────────────────────────────────────
    .get(
      `${prefix}/assets/:id/tags`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const auth = ctx as unknown as AuthContext;
        const { id, } = ctx.params;
        const asset = await resolveAccessibleAsset(database, id, userId, auth.userRole,);
        if (asset instanceof Response) { return asset; }
        const tags = await listAssetTags(database, asset.id, userId,);
        return jsonResponse({ tags, },);
      },
      {
        params: AssetIdParams,
        response: {
          200: AssetTagListResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List asset tags",
          description: "Global tags plus the caller's own user-scoped tags.",
          tags: ["Assets", "Tags",],
        },
      },
    )
    // ── Add ──────────────────────────────────────────────────
    .post(
      `${prefix}/assets/:id/tags`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const auth = ctx as unknown as AuthContext;
        const { id, } = ctx.params;
        const body = ctx.body as typeof AddAssetTagBody.static;
        const asset = await getAsset(database, id,);
        if (!asset) { return notFoundResponse("Asset not found",); }

        if (body.scope === AssetTagScope.Global) {
          if (!canCurateGlobal(userId, auth.userRole, asset.owner_id,)) {
            return forbiddenResponse("Only the asset owner can add global tags",);
          }
          const tag = await addAssetTag({
            database,
            assetId: id,
            tag: body.tag,
            scope: AssetTagScope.Global,
            ownerId: null,
          },);
          return jsonResponse({ tag, },);
        }

        const tag = await addAssetTag({
          database,
          assetId: id,
          tag: body.tag,
          scope: AssetTagScope.User,
          ownerId: userId,
        },);
        return jsonResponse({ tag, },);
      },
      {
        params: AssetIdParams,
        body: AddAssetTagBody,
        response: {
          200: AssetTagResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Add an asset tag",
          description: "Add a user-scoped or global tag.",
          tags: ["Assets", "Tags",],
        },
      },
    )
    // ── Remove ───────────────────────────────────────────────
    .delete(
      `${prefix}/assets/:id/tags`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const auth = ctx as unknown as AuthContext;
        const { id, } = ctx.params;
        const body = ctx.body as typeof RemoveAssetTagBody.static;
        const asset = await getAsset(database, id,);
        if (!asset) { return notFoundResponse("Asset not found",); }

        const ownerId = body.scope === AssetTagScope.User ? userId : null;
        if (body.scope === AssetTagScope.Global) {
          if (!canCurateGlobal(userId, auth.userRole, asset.owner_id,)) {
            return forbiddenResponse("Only the asset owner can remove global tags",);
          }
        }

        await removeAssetTag(database, id, body.tag, body.scope, ownerId,);
        return jsonNoContent();
      },
      {
        params: AssetIdParams,
        body: RemoveAssetTagBody,
        response: {
          204: t.Void(),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Remove an asset tag",
          description: "Remove a user-scoped or global tag.",
          tags: ["Assets", "Tags",],
        },
      },
    )
    // ── Rename ───────────────────────────────────────────────
    .post(
      `${prefix}/assets/:id/tags/rename`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const auth = ctx as unknown as AuthContext;
        const { id, } = ctx.params;
        const body = ctx.body as typeof RenameAssetTagBody.static;
        const asset = await getAsset(database, id,);
        if (!asset) { return notFoundResponse("Asset not found",); }

        const ownerId = body.scope === AssetTagScope.User ? userId : null;
        if (body.scope === AssetTagScope.Global) {
          if (!canCurateGlobal(userId, auth.userRole, asset.owner_id,)) {
            return forbiddenResponse("Only the asset owner can rename global tags",);
          }
        }

        const tag = await renameAssetTag({
          database,
          assetId: id,
          oldTag: body.oldTag,
          newTag: body.newTag,
          scope: body.scope,
          ownerId,
        },);
        if (!tag) { return badRequestResponse("oldTag and newTag must differ",); }
        return jsonResponse({ tag, },);
      },
      {
        params: AssetIdParams,
        body: RenameAssetTagBody,
        response: {
          200: AssetTagResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Rename an asset tag",
          description: "Rename a user-scoped or global tag.",
          tags: ["Assets", "Tags",],
        },
      },
    )
    // ── Propositions ─────────────────────────────────────────
    .get(
      `${prefix}/assets/:id/tag-propositions`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const auth = ctx as unknown as AuthContext;
        const { id, } = ctx.params;
        const asset = await resolveAccessibleAsset(database, id, userId, auth.userRole,);
        if (asset instanceof Response) { return asset; }
        const propositions = await proposeTags(database, asset.id, userId,);
        return jsonResponse({ propositions, },);
      },
      {
        params: AssetIdParams,
        response: {
          200: TagPropositionListResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Propose asset tags",
          description: "Metadata-derived tag suggestions not yet applied or dismissed.",
          tags: ["Assets", "Tags",],
        },
      },
    )
    // ── Dismiss proposition ──────────────────────────────────
    .delete(
      `${prefix}/assets/:id/tag-propositions`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const auth = ctx as unknown as AuthContext;
        const { id, } = ctx.params;
        const asset = await resolveAccessibleAsset(database, id, userId, auth.userRole,);
        if (asset instanceof Response) { return asset; }
        const body = ctx.body as typeof DismissTagPropositionBody.static;
        await dismissProposition(database, asset.id, body.tag, userId,);
        return jsonNoContent();
      },
      {
        params: AssetIdParams,
        body: DismissTagPropositionBody,
        response: {
          204: t.Void(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Dismiss a proposed tag",
          description: "Prevent a proposed tag from being re-suggested for this asset.",
          tags: ["Assets", "Tags",],
        },
      },
    )
    // ── Autocomplete vocabulary ──────────────────────────────
    .get(
      `${prefix}/tag-autocomplete`,
      async (ctx,) => {
        const auth = ctx as unknown as AuthContext;
        const userId = auth.userId;
        const url = new URL(ctx.request.url,);
        const q = url.searchParams.get("q",) ?? undefined;
        const tags = await tagVocabulary(database, userId, q,);
        return jsonResponse({ tags, },);
      },
      {
        response: {
          200: TagAutocompleteResponse,
        },
        detail: {
          summary: "Tag autocomplete vocabulary",
          description: "Distinct tags visible to the caller, narrowed by prefix.",
          tags: ["Assets", "Tags",],
        },
      },
    );
}
