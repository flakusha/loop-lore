// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/asset-search/
//
// Backend fuzzy search over visible assets for the gallery (replaces the
// client-side `globalThis.filterAssets` substring filter). Ranks the viewer's
// visible candidate set with the shared `fuzzyScore` baseline and pages over
// the ranked hits. Visibility matches the gallery grid (`visibleAssetFilter`:
// public, owned, or explicitly shared — admins see all).
//
// `total` covers the newest ASSET_FUZZY_CANDIDATE_CAP visible candidates;
// libraries beyond the cap page within that window until trigram-FTS ranking
// lands server-side.
import { Elysia, } from "elysia";
import { getLogger, } from "../../logger";
import { ASSET_FUZZY_CANDIDATE_CAP, searchAssets, } from "../../search";
import {
  AssetSearchQuery,
  AssetSearchResponse,
  ErrorResponse,
} from "../../validation/schemas";
import { extractAuth, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function assetSearchRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "asset-search", },)
      .get(
        `${prefix}/assets/search`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          const query = ctx.query as typeof AssetSearchQuery.static;
          // Elysia coerces absent Optional enum params to union member 0
          // (visibility -> "private"), so presence comes from the raw URL.
          const params = new URL(ctx.request.url,).searchParams;
          const q = (query.q ?? "").trim();
          const limit = query.limit ?? 20;
          const offset = query.offset ?? 0;

          if (q === "") {
            return jsonResponse({ results: [], total: 0, hasMore: false, query: q, },);
          }

          const hits = await searchAssets(database, q, {
            userId,
            userRole,
            visibility: params.has("visibility",) ? query.visibility : undefined,
            assetType: params.has("assetType",) ? query.assetType : undefined,
            topK: ASSET_FUZZY_CANDIDATE_CAP,
          },);

          const total = hits.length;
          const page = hits.slice(offset, offset + limit,);
          const results: Array<{
            assetId: string;
            filename: string;
            altText: string | null;
            assetType: string;
            mimeType: string;
            visibility: string;
            matchScore: number;
          }> = [];
          for (const hit of page) {
            results.push({
              assetId: hit.payload.assetId,
              filename: hit.payload.filename,
              altText: hit.payload.altText,
              assetType: hit.payload.assetType,
              mimeType: hit.payload.mimeType,
              visibility: hit.payload.visibility,
              matchScore: hit.score,
            },);
          }

          getLogger().child({ module: "asset-search", },).info("Asset search", {
            q,
            resultCount: results.length,
            total,
          },);

          return jsonResponse({
            results,
            total,
            hasMore: offset + results.length < total,
            query: q,
          },);
        },
        {
          query: AssetSearchQuery,
          response: {
            200: AssetSearchResponse,
            400: ErrorResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Search assets",
            description: "Fuzzy search over file names and descriptions, scoped to assets visible " +
              "to the caller. Relevance-ranked with limit/offset pagination.",
            tags: ["Assets", "Search",],
          },
        },
      )
  );
}
