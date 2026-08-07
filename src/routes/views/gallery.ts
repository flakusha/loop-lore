import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { escapeHtml, htmlResponse, } from "./layout";

function formatSize(bytes: number,): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / 1_048_576).toFixed(1,)} MB`;
}

async function serveGalleryGrid(database: Kysely<DB>, params?: URLSearchParams,): Promise<Response> {
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

  if (assets.length === 0) {
    return htmlResponse(`<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets found</div>
      <div class="description">Upload images, audio, or video to get started.</div>
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
      default: {
        return `<div class="file-icon">📄</div>`;
      }
    }
  }

  const cards = Array.from(assets, (a,) => {
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

export { formatSize, serveGalleryGrid, };
