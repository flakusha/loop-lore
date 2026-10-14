// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Knowledge graph over asset_links (FEA-2026-058). */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { AnalyticsCtx, } from "./types";

interface Node {
  id: string;
  kind: "asset" | "entity";
  label: string;
}
interface Edge {
  source: string;
  target: string;
  label: string | null;
}

// GET /api/memory/knowledge-graph
export async function knowledgeGraphHandler(db: Kysely<DB>, ctx: AnalyticsCtx,): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const links = await db
    .selectFrom("asset_links",)
    .select(["asset_id", "entity_type", "entity_id", "label",],)
    .execute();

  const assetIds = [...new Set(links.map((l,) => l.asset_id),),];
  const assets = assetIds.length === 0
    ? []
    : await db
      .selectFrom("assets",)
      .select(["id", "filename", "alt_text", "owner_id",],)
      .where("id", "in", assetIds,)
      .where("owner_id", "=", userId,)
      .execute();

  const assetSet = new Set(assets.map((a,) => a.id),);
  const nodes: Node[] = [];

  const nodeIds = new Set<string>();
  for (const a of assets) {
    if (!nodeIds.has(`asset:${a.id}`,)) {
      nodeIds.add(`asset:${a.id}`,);
      nodes.push({ id: `asset:${a.id}`, kind: "asset", label: a.alt_text ?? a.filename, },);
    }
  }

  const edges: Edge[] = [];

  const seenEntities = new Set<string>();
  for (const l of links) {
    if (!assetSet.has(l.asset_id,)) { continue; }
    const entityId = `${l.entity_type}:${l.entity_id}`;
    if (!seenEntities.has(entityId,)) {
      seenEntities.add(entityId,);
      nodes.push({ id: `entity:${entityId}`, kind: "entity", label: entityId, },);
    }

    edges.push({ source: `asset:${l.asset_id}`, target: `entity:${entityId}`, label: l.label ?? null, },);
  }

  return jsonResponse({ nodes, edges, },);
}
