// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { AssetType, } from "../../db/enums";
import { ActorType, ActorVisibility, AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { escapeHtml, htmlResponse, } from "./layout";

function formatSize(bytes: number,): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / 1_048_576).toFixed(1,)} MB`;
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

async function serveGalleryGrid(
  database: Kysely<DB>,
  params?: URLSearchParams,
  actorId?: string | null,
  actorRole?: string | null,
): Promise<Response> {
  const entityType = params?.get("entityType",) ?? null;
  const entityId = params?.get("entityId",) ?? null;

  let qb = database
    .selectFrom("assets",)
    .selectAll("assets",)
    .orderBy("filename", "asc",)
    .limit(200,);

  // Filter by linked entity when entityType/entityId provided
  if (entityType && entityId) {
    qb = qb
      .innerJoin("asset_links", "asset_links.asset_id", "assets.id",)
      .where("asset_links.entity_type", "=", entityType as any,)
      .where("asset_links.entity_id", "=", entityId,);
  }

  const assets = await qb.execute();

  // G6 visibility inheritance — hide private-owner's character assets from non-owners. When the
  // helper reports nothing hidden (common path: no private-actor links, or admin/owner view), reuse
  // the query result directly and avoid allocating a second buffer.
  if (can(actorRole, "admin.character",)) {
    return htmlResponse(renderCards(assets,),);
  }
  const ids = Array.from(assets, (a,) => a.id,);
  const hidden = await inheritedHiddenAssetIds(database, ids, actorId ?? null, actorRole ?? null,);
  if (hidden.size === 0) {
    return htmlResponse(renderCards(assets,),);
  }

  const visible: (typeof assets)[number][] = [];
  for (const asset of assets) {
    if (!hidden.has(asset.id,)) {
      visible.push(asset,);
    }
  }
  return htmlResponse(renderCards(visible,),);
}

function renderCards(
  assets: readonly { id: string; filename: string; asset_type: AssetType; size_bytes: number }[],
): string {
  if (assets.length === 0) {
    return `<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets found</div>
      <div class="description">Upload images, audio, or video to get started.</div>
    </div>`;
  }

  function thumbForAsset(a: { id: string; filename: string; asset_type: AssetType },): string {
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

  const cards: string[] = [];
  for (const a of assets) {
    const filename = escapeHtml(a.filename,);
    const size = formatSize(a.size_bytes,);
    cards.push(`<div class="asset-card" onclick="openAssetPreview('${a.id}')" data-testid="asset-card-${a.id}">
      <div class="thumb">${thumbForAsset(a,)}</div>
      <div class="details">
        <span class="name">${filename}</span>
        <span class="type">${size}</span>
      </div>
    </div>`,);
  }
  return cards.join("",);
}

export { formatSize, inheritedHiddenAssetIds, serveGalleryGrid, };
