// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /asset-list, /asset-preview, /asset-search — asset browsing and search.
 */

import { canAccessAsset, getAsset, getAssetLinks, listAssets, } from "../../assets/service";
import { AssetType, } from "../../db/enums-content";
import { requireWorldAccess, } from "../../routes/worlds/access";
import { searchAssets, } from "../../search";
import { type CommandResult, registerCommand, } from "./registry";

const VALID_KINDS: Record<string, true> = {
  [AssetType.Image]: true,
  [AssetType.Audio]: true,
  [AssetType.Video]: true,
  [AssetType.Memory]: true,
  [AssetType.Other]: true,
};

registerCommand("asset-list", async (args, ctx,): Promise<CommandResult> => {
  const kind = args[0]?.toLowerCase();
  if (kind && !(kind in VALID_KINDS)) {
    return { systemMessage: `Invalid kind. Valid: ${Object.values(AssetType,).join(", ",)}`, handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Assets unavailable:** command context missing database.", handled: true, };
  }

  const worldId = ctx.activeChat?.worldId;
  if (worldId) {
    const denied = await requireWorldAccess(db, worldId, ctx.userId ?? null, null,);
    if (denied) {
      return { systemMessage: "**Access denied:** cannot list assets in this world.", handled: true, };
    }
  }

  const { data, total, } = await listAssets(db, {
    actorId: ctx.userId ?? null,
    actorRole: null,
    pageSize: 50,
  },);

  const filtered = kind ? data.filter((a,) => a.asset_type === kind) : data;
  if (filtered.length === 0) {
    return { systemMessage: "No assets found.", handled: true, };
  }

  const list = filtered.map((a,) => `- **${a.filename}** (${a.asset_type}) [${a.id}]`).join("\n",);
  return {
    systemMessage: `**Assets (${filtered.length}/${total}):**\n\n${list}`,
    action: "asset-list",
    actionPayload: { assets: filtered, },
    handled: true,
  };
}, { requiredRole: "member", },);

registerCommand("asset-preview", async (args, ctx,): Promise<CommandResult> => {
  const assetId = args[0];
  if (!assetId) {
    return { systemMessage: "Usage: /asset-preview <asset-id>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Assets unavailable:** command context missing database.", handled: true, };
  }

  const allowed = await canAccessAsset(db, assetId, ctx.userId ?? null, null,);
  if (!allowed) {
    return { systemMessage: "**Access denied:** cannot preview this asset.", handled: true, };
  }

  const asset = await getAsset(db, assetId,);
  if (!asset) {
    return { systemMessage: `Asset not found: ${assetId}`, handled: true, };
  }

  const links = await getAssetLinks(db, assetId,);
  const linkStr = links.map((l,) => `${l.entity_type}:${l.entity_id}${l.label ? ` (${l.label})` : ""}`).join(", ",);

  return {
    systemMessage: [
      `**Asset:** ${asset.filename}`,
      `**Type:** ${asset.asset_type} (${asset.mime_type})`,
      `**Size:** ${asset.size_bytes} bytes`,
      asset.alt_text ? `**Alt:** ${asset.alt_text}` : "",
      linkStr ? `**Links:** ${linkStr}` : "",
    ].filter(Boolean,).join("\n",),
    action: "asset-preview",
    actionPayload: { asset, links, },
    handled: true,
  };
}, { requiredRole: "member", },);

registerCommand("asset-search", async (args, ctx,): Promise<CommandResult> => {
  const query = args.join(" ",).trim();
  if (!query) {
    return { systemMessage: "Usage: /asset-search <query>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Assets unavailable:** command context missing database.", handled: true, };
  }

  const worldId = ctx.activeChat?.worldId;
  if (worldId) {
    const denied = await requireWorldAccess(db, worldId, ctx.userId ?? null, null,);
    if (denied) {
      return { systemMessage: "**Access denied:** cannot search assets in this world.", handled: true, };
    }
  }

  const hits = await searchAssets(db, query, {
    userId: ctx.userId ?? "",
    userRole: null,
  },);

  if (hits.length === 0) {
    return { systemMessage: `No assets found for "${query}".`, handled: true, };
  }

  const list = hits.map((h,) => {
    const p = h.payload as { assetId: string; filename: string; assetType: string };
    return `- **${p.filename}** (${p.assetType}) [${p.assetId}]`;
  },).join("\n",);

  return {
    systemMessage: `**Asset Results (${hits.length}):**\n\n${list}`,
    action: "asset-search",
    actionPayload: { hits, },
    handled: true,
  };
}, { requiredRole: "member", },);
