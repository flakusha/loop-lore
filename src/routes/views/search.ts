// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { ActorType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { formatSize, inheritedHiddenAssetIds, } from "./gallery";
import { escapeHtml, htmlResponse, } from "./layout";

async function serveGallerySearch(
  database: Kysely<DB>,
  params: URLSearchParams,
  actorId?: string | null,
  actorRole?: string | null,
): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const type = params.get("type",) ?? "all";
  const sort = params.get("sort",) ?? "name";
  const entityType = params.get("entityType",) ?? null;
  const entityId = params.get("entityId",) ?? null;

  let qb = database
    .selectFrom("assets",)
    .selectAll("assets",);

  // Filter by linked entity when entityType/entityId provided
  if (entityType && entityId) {
    qb = qb
      .innerJoin("asset_links", "asset_links.asset_id", "assets.id",)
      .where("asset_links.entity_type", "=", entityType as any,)
      .where("asset_links.entity_id", "=", entityId,);
  }

  if (query) {
    qb = qb.where("filename", "like", `%${query}%`,);
  }
  if (type !== "all") {
    qb = qb.where("asset_type", "=", type as any,);
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

  if (visible.length === 0) {
    return htmlResponse(`<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets match your search</div>
      <div class="description">Try different search terms.</div>
    </div>`,);
  }

  function thumbForAsset(a: (typeof assets)[number],): string {
    switch (a.asset_type) {
      case "image": {
        return `<img src="/api/assets/${a.id}/thumb" alt="${escapeHtml(a.filename,)}" loading="lazy" />`;
      }
      case "audio": {
        return `<div class="file-icon">🎵</div>`;
      }
      case "video": {
        return `<div class="file-icon">🎬</div>`;
      }
      case "other":
      case "memory": {
        return `<div class="file-icon">📄</div>`;
      }
    }
  }

  const cards = Array.from(visible, (a,) => {
    const filename = escapeHtml(a.filename,);
    const size = formatSize(a.size_bytes,);
    return `<div class="asset-card" onclick="openAssetPreview('${a.id}')" data-testid="asset-card-${a.id}">
      <div class="thumb">${thumbForAsset(a,)}</div>
      <div class="details">
        <span class="name">${filename}</span>
        <span class="type">${size}</span>
      </div>
    </div>`;
  },).join("",);

  return htmlResponse(cards,);
}

async function serveCharactersSearch(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const sort = params.get("sort",) ?? "name";

  let qb = database.selectFrom("actors",).selectAll().where("actor_type", "!=", ActorType.User,);

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
      ? `<img src="/api/assets/${c.avatar_asset_id}/thumb" alt="Avatar" />`
      : "<span>👤</span>";
    const name = escapeHtml(c.display_name,);
    const desc = escapeHtml(c.description || "",);
    return `<div class="character-card" onclick="selectCharacterCard('${c.id}')" data-testid="character-card-${c.id}">
      <div class="card-img">${avatar}</div>
      <div class="card-body">
        <div class="name">${name}</div>
        <div class="description">${desc}</div>
      </div>
    </div>`;
  },).join("",);

  return htmlResponse(cards,);
}

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
    return `<div class="world-card" onclick="location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
      <div class="world-header"><h3 class="world-name">${name}</h3><span class="world-id">ID: ${w.id}</span></div>
      <div class="world-description">${desc}</div>
      <div class="world-meta"><span class="tag">0 chats</span></div>
    </div>`;
  },).join("",);

  return htmlResponse(items,);
}

export { serveCharactersSearch, serveGallerySearch, serveWorldsSearch, };
