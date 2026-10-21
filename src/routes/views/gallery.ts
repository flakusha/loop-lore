// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, SelectQueryBuilder, } from "kysely";
import { visibleGalleryAssetFilter, } from "../../assets/service/read";
import { visibleTagNames, } from "../../assets/service/tag-facets";
import { ActorType, ActorVisibility, AssetLinkEntity, AssetTagScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { renderGalleryCards, renderGalleryErrorCard, } from "./gallery-cards";
import { htmlResponse, } from "./layout";
import {
  buildGalleryGridViewModel,
  type GalleryGridViewModel,
} from "./view-models/gallery-grid";

export const GRID_PAGE_SIZE = 200;

/** Filter inputs shared by the gallery grid and the gallery search. */
export interface GalleryAssetFilters {
  /** Viewer actor id (empty when anonymous). */
  actorId: string | null | undefined;
  /** True when the viewer holds `admin.character` (bypasses visibility). */
  isAdmin: boolean;
  /** `entityType` query param, or null. */
  entityType: string | null;
  /** `entityId` query param, or null. */
  entityId: string | null;
  /** `tag` query param, or null. */
  tag: string | null;
}

/**
 * Apply the gallery asset filters — visibility, linked-entity, and visible-tag —
 * shared verbatim by the grid and the search so the two cannot drift apart.
 * @param qb Asset query builder.
 * @param filters
 * @returns The narrowed query builder.
 */
export function applyGalleryAssetFilters<QB extends SelectQueryBuilder<DB, "assets", any>,>(
  qb: QB,
  filters: GalleryAssetFilters,
): QB {
  const { actorId, isAdmin, entityType, entityId, tag, } = filters;
  let out = qb;

  // Same visibility model as listAssets: public, owned by the viewer, or
  // explicitly shared with the viewer — plus assets linked to a PUBLIC
  // character, whose avatars inherit the character's visibility (G6).
  if (!isAdmin) {
    out = out.where((eb,) => visibleGalleryAssetFilter(eb, actorId ?? "",)) as QB;
  }

  // Filter by linked entity when entityType/entityId provided
  if (entityType !== null && entityId && Object.values(AssetLinkEntity,).includes(entityType as AssetLinkEntity,)) {
    out = out
      .innerJoin("asset_links", "asset_links.asset_id", "assets.id",)
      .where("asset_links.entity_type", "=", entityType as AssetLinkEntity,)
      .where("asset_links.entity_id", "=", entityId,) as QB;
  }

  // Filter by visible tag name when `tag` provided: global tags plus the
  // viewer's own user-scoped tags — other users' private tags never match.
  if (tag !== null && tag !== "all") {
    out = out.where((eb,) =>
      eb.exists(
        eb.selectFrom("asset_tags as ft",)
          .select("ft.id",)
          .whereRef("ft.asset_id", "=", "assets.id",)
          .where("ft.tag", "=", tag,)
          .where((eb2,) =>
            eb2.or([
              eb2("ft.scope", "=", AssetTagScope.Global,),
              eb2("ft.owner_id", "=", actorId ?? "",),
            ],)
          ),
      )
    ) as QB;
  }

  return out;
}

/**
 * Visibility inheritance (G6): filter out assets whose only/any actor link points
 * to a character the viewer does not own, when that character is private.
 *
 * Character avatars are linked via asset_links (entity_type="actor",
 * entity_id = actor id). A private character's avatars must be visible only to
 * the character's owner (public characters keep their assets public). This is a
 * gallery-layer filter — the assets themselves are not modified.
 *
 * Returns the set of asset IDs to hide. Non-owner viewers see nothing of the
 * private character's assets; admins (admin.character) see all.
 * @returns the asset IDs this viewer must not see
 * @param database
 * @param assetIds
 * @param actorId
 * @param actorRole
 */
async function inheritedHiddenAssetIds(
  database: Kysely<DB>,
  assetIds: readonly string[],
  actorId: string | null,
  actorRole: string | null,
): Promise<Set<string>> {
  if (assetIds.length === 0) { return new Set(); }
  if (can(actorRole, "admin.character",)) { return new Set(); }

  // actor links for the candidate assets that belong to a *private* character
  const privateLinks = await database
    .selectFrom("asset_links",)
    .innerJoin("actors", "actors.id", "asset_links.entity_id",)
    .select(["asset_links.asset_id", "actors.owner_id",],)
    .where("asset_links.entity_type", "=", AssetLinkEntity.Actor,)
    .where("actors.actor_type", "=", ActorType.Character,)
    .where("actors.visibility", "=", ActorVisibility.Private,)
    .where("asset_links.asset_id", "in", assetIds as never,)
    .execute();

  const hidden = new Set<string>();
  for (const link of privateLinks) {
    if (link.owner_id !== actorId) {
      hidden.add(link.asset_id,);
    }
  }

  return hidden;
}

/**
 * Outcome of loading the gallery grid: either the view-model both
 * representations share, or the validation error the htmx view renders as an
 * error card.
 */
export type GalleryGridLoad =
  | { ok: true; viewModel: GalleryGridViewModel }
  | { ok: false; error: string };

/**
 * Fetch and project one page of gallery assets — the single data path behind
 * the htmx grid fragment and the JSON view-model branch.
 * @param options
 * @returns the view-model, or `{ ok: false }` for an invalid filter combination
 */
export async function loadGalleryGridViewModel(
  { database, params, actorId, actorRole, }: {
    database: Kysely<DB>;
    params?: URLSearchParams;
    actorId?: string | null;
    actorRole?: string | null;
  },
): Promise<GalleryGridLoad> {
  const isAdmin = can(actorRole ?? null, "admin.character",);
  const entityTypeParam = params?.get("entityType",) ?? null;
  const entityId = params?.get("entityId",) ?? null;
  const page = Math.max(Number(params?.get("page",) ?? "1",) || 1, 1,);

  let qb = database
    .selectFrom("assets",)
    .selectAll("assets",)
    .orderBy("filename", "asc",)
    .limit(GRID_PAGE_SIZE,)
    .offset((page - 1) * GRID_PAGE_SIZE,);

  const entityTypeValid = entityTypeParam !== null &&
    Object.values(AssetLinkEntity,).includes(entityTypeParam as AssetLinkEntity,);

  if (entityTypeParam !== null && !entityTypeValid) {
    return { ok: false, error: "Invalid entity type", };
  }

  qb = applyGalleryAssetFilters(qb, {
    actorId,
    isAdmin,
    entityType: entityTypeParam,
    entityId,
    tag: params?.get("tag",) ?? null,
  },);

  const assets = await qb.execute();

  let visible = assets;
  if (!isAdmin) {
    // G6 visibility inheritance — hide private-owner's character assets from
    // non-owners. When nothing is hidden (common path), reuse the query result
    // directly and avoid allocating a second buffer.
    const ids = Array.from(assets, (a,) => a.id,);
    const hidden = await inheritedHiddenAssetIds(database, ids, actorId ?? null, actorRole ?? null,);
    if (hidden.size > 0) {
      visible = [];
      for (const asset of assets) {
        if (!hidden.has(asset.id,)) {
          visible.push(asset,);
        }
      }
    }
  }

  const tagMap = await visibleTagNames(database, Array.from(visible, (a,) => a.id,), actorId ?? null,);
  return {
    ok: true,
    viewModel: buildGalleryGridViewModel({ rows: visible, tagMap, page, pageSize: GRID_PAGE_SIZE, },),
  };
}

/**
 * @param database
 * @param params
 * @param actorId
 * @param actorRole
 * @returns the paginated gallery-grid HTML fragment
 */
async function serveGalleryGrid(
  database: Kysely<DB>,
  params?: URLSearchParams,
  actorId?: string | null,
  actorRole?: string | null,
): Promise<Response> {
  const load = await loadGalleryGridViewModel({ database, params, actorId, actorRole, },);
  if (!load.ok) {
    return htmlResponse(renderGalleryErrorCard(load.error,),);
  }

  return htmlResponse(renderGalleryCards(load.viewModel,),);
}

export { inheritedHiddenAssetIds, serveGalleryGrid, };
