// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { visibleTagNames, } from "../../assets/service/tag-facets";
import { ActorType, AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { type ViewsViewer, visibleCharactersTo, } from "./access";
import { applyGalleryAssetFilters, inheritedHiddenAssetIds, } from "./gallery";
import { renderGalleryCards, renderGalleryEmptyState, } from "./gallery-cards";
import { escapeHtml, htmlResponse, } from "./layout";
import { buildGallerySearchViewModel, type GallerySearchViewModel, } from "./view-models/gallery-grid";

/**
 * Fetch and project the gallery search result set — the single data path
 * behind the htmx search fragment and the JSON view-model branch.
 * @param options
 * @returns the search view-model both representations share
 */
export async function loadGallerySearchViewModel(
  { database, params, actorId, actorRole, }: {
    database: Kysely<DB>;
    params: URLSearchParams;
    actorId?: string | null;
    actorRole?: string | null;
  },
): Promise<GallerySearchViewModel> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const type = params.get("type",) ?? "all";
  const sort = params.get("sort",) ?? "name";
  const entityType = params.get("entityType",) ?? null;
  const entityId = params.get("entityId",) ?? null;
  const tag = params.get("tag",) ?? null;
  const isAdmin = can(actorRole ?? null, "admin.character",);

  let qb = database
    .selectFrom("assets",)
    .selectAll("assets",);

  // Same visibility + linked-entity + tag filters as the authenticated
  // gallery grid, so the two views cannot drift apart.
  qb = applyGalleryAssetFilters(qb, { actorId, isAdmin, entityType, entityId, tag, },);

  if (query) {
    qb = qb.where("filename", "like", `%${query}%`,);
  }

  if (type !== "all" && Object.values(AssetType,).includes(type as AssetType,)) {
    qb = qb.where("asset_type", "=", type as AssetType,);
  }

  if (sort === "newest") { qb = qb.orderBy("created_at", "desc",); }
  else if (sort === "oldest") { qb = qb.orderBy("created_at", "asc",); }
  else { qb = qb.orderBy("filename", "asc",); }

  const assets = await qb.limit(200,).execute();

  // G6 visibility inheritance — hide private-owner's character assets from non-owners
  const ids = Array.from(assets, (a,) => a.id,);
  const hidden = await inheritedHiddenAssetIds(database, ids, actorId ?? null, actorRole ?? null,);

  const visible: (typeof assets)[number][] = [];
  for (const asset of assets) {
    if (!hidden.has(asset.id,)) {
      visible.push(asset,);
    }
  }

  const tagMap = await visibleTagNames(database, Array.from(visible, (a,) => a.id,), actorId ?? null,);
  return buildGallerySearchViewModel({ rows: visible, tagMap, },);
}

/**
 * @param database
 * @param params
 * @param actorId
 * @param actorRole
 * @returns the matching gallery asset cards as HTML
 */
async function serveGallerySearch(
  database: Kysely<DB>,
  params: URLSearchParams,
  actorId?: string | null,
  actorRole?: string | null,
): Promise<Response> {
  const viewModel = await loadGallerySearchViewModel({ database, params, actorId, actorRole, },);
  if (viewModel.assets.length === 0) {
    return htmlResponse(renderGalleryEmptyState("search",),);
  }

  return htmlResponse(renderGalleryCards(viewModel,),);
}

/**
 * @param database
 * @param params
 * @param viewer - who is asking; scopes the rows to the characters they own
 * @returns the matching character cards as HTML
 */
async function serveCharactersSearch(
  database: Kysely<DB>,
  params: URLSearchParams,
  viewer: ViewsViewer,
): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const sort = params.get("sort",) ?? "name";

  let qb = database
    .selectFrom("actors",)
    .selectAll()
    .where("actor_type", "!=", ActorType.User,)
    .where(visibleCharactersTo(viewer,),);

  if (query) {
    qb = qb.where("display_name", "like", `%${query}%`,);
  }

  if (sort === "newest") { qb = qb.orderBy("created_at", "desc",); }
  else if (sort === "oldest") { qb = qb.orderBy("created_at", "asc",); }
  else { qb = qb.orderBy("display_name", "asc",); }

  const actors = await qb.limit(200,).execute();

  if (actors.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)" data-testid="characters-empty">
      <div class="icon">👤</div>
      <div class="title">No characters match your search</div>
      <div class="description">Try different search terms.</div>
    </div>`,);
  }

  const cards = Array.from(actors, (c,) => {
    const avatar = c.avatar_asset_id
      ? `<img src="/api/v1/assets/${c.avatar_asset_id}/thumb" alt="Avatar" />`
      : "<span>👤</span>";

    const name = escapeHtml(c.display_name,);
    const desc = escapeHtml(c.description || "",);
    return `<div class="character-card" x-on:click="window.selectCharacterCard('${c.id}')" data-testid="character-card-${c.id}">
      <div class="card-img">${avatar}</div>
      <div class="card-body">
        <div class="name">${name}</div>
        <div class="description">${desc}</div>
      </div>
    </div>`;
  },).join("",);

  return htmlResponse(cards,);
}

/**
 * @param database
 * @param params
 * @param userId
 * @param userRole
 * @returns the worlds visible to this user matching the query, as HTML
 */
async function serveWorldsSearch(
  database: Kysely<DB>,
  params: URLSearchParams,
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const sort = params.get("sort",) ?? "name";

  let qb = database.selectFrom("worlds",).selectAll();
  // Non-admin users only see their own worlds (mirrors GET /api/worlds).
  if (userId && !can(userRole, "admin.world",)) {
    qb = qb.where("owner_id", "=", userId,);
  }

  if (query) {
    qb = qb.where("name", "like", `%${query}%`,);
  }

  if (sort === "newest") { qb = qb.orderBy("created_at", "desc",); }
  else if (sort === "oldest") { qb = qb.orderBy("created_at", "asc",); }
  else { qb = qb.orderBy("name", "asc",); }

  const worlds = await qb.limit(100,).execute();

  if (worlds.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">🌍</div>
      <div class="title">No worlds match your search</div>
      <div class="description">Try different search terms.</div>
    </div>`,);
  }

  const items = Array.from(worlds, (w,) => {
    const name = escapeHtml(w.name,);
    const desc = escapeHtml(w.description || "",);
    return `<div class="world-card" x-on:click="window.location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
      <div class="world-header"><h3 class="world-name">${name}</h3><span class="world-id">ID: ${w.id}</span></div>
      <div class="world-description">${desc}</div>
      <div class="world-meta"><span class="tag">0 chats</span></div>
    </div>`;
  },).join("",);

  return htmlResponse(items,);
}

export { serveCharactersSearch, serveGallerySearch, serveWorldsSearch, };
