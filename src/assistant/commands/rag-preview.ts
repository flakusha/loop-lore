// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `/rag-preview <doc-id>` — inline preview of an indexed lore document
 * (epic batch B1 remainder).
 *
 * The unified document model (`epic-rag-assets-unified-storage-and-assistant-
 * flows.md`) has not landed, so a "document" is currently a lore entry row in
 * `world_lore_entries` / `actor_lore_entries`. The preview is read-only: the
 * row is loaded behind `requireWorldAccess` on its `world_id` and rendered as
 * a system message (the same surface `/rag-search` uses).
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { requireWorldAccess, } from "../../routes/worlds/access";
import { quotaGate, } from "../quota/gate";
import { type CommandResult, registerCommand, } from "./registry";

/** A lore row resolved from either lore table. */
interface LoreDocument {
  id: string;
  name: string;
  content: string;
  source: "world" | "actor";
  worldId: string;
  enabled: string;
  keys: string | null;
  priority: number;
}

/**
 * Load a lore document by id, trying the world table then the actor table.
 * @param db - typed Kysely instance
 * @param docId - lore entry id
 * @returns the document row, or null when the id matches no row
 */
async function loadLoreDocument(db: Kysely<DB>, docId: string,): Promise<LoreDocument | null> {
  const worldRow = await db
    .selectFrom("world_lore_entries",)
    .select(["id", "name", "content", "world_id", "enabled", "keys", "priority",],)
    .where("id", "=", docId,)
    .executeTakeFirst();

  if (worldRow) {
    return {
      id: worldRow.id,
      name: worldRow.name ?? worldRow.id,
      content: worldRow.content,
      source: "world",
      worldId: worldRow.world_id,
      enabled: String(worldRow.enabled,),
      keys: worldRow.keys,
      priority: worldRow.priority,
    };
  }

  const actorRow = await db
    .selectFrom("actor_lore_entries",)
    .select(["id", "name", "content", "world_id", "enabled", "keys", "priority",],)
    .where("id", "=", docId,)
    .executeTakeFirst();

  if (!actorRow || actorRow.world_id === null) { return null; }

  return {
    id: actorRow.id,
    name: actorRow.name ?? actorRow.id,
    content: actorRow.content,
    source: "actor",
    worldId: actorRow.world_id,
    enabled: String(actorRow.enabled,),
    keys: actorRow.keys,
    priority: actorRow.priority,
  };
}

registerCommand("rag-preview", async (args, ctx,): Promise<CommandResult> => {
  const quota = quotaGate(ctx.userId ?? null, "rag-preview",);
  if (quota) { return quota; }

  const docId = args[0] || "";
  if (!docId) {
    return { systemMessage: "Usage: /rag-preview <doc-id>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**RAG preview unavailable:** command context missing database.", handled: true, };
  }

  const doc = await loadLoreDocument(db, docId,);
  if (!doc) {
    return { systemMessage: `Document ${docId} not found.`, handled: true, };
  }

  const denied = await requireWorldAccess(db, doc.worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (denied) {
    return { systemMessage: `Document ${docId} not found or not accessible to you.`, handled: true, };
  }

  const lines = [
    `**Document preview** — **${doc.name}** [${doc.id}]`,
    `Source: ${doc.source} lore · world \`${doc.worldId}\` · ${doc.enabled} · priority ${doc.priority}`,
    doc.keys ? `Keys: ${doc.keys}` : "",
    "",
    doc.content,
  ].filter((l,) => l !== "");

  return { systemMessage: lines.join("\n",), handled: true, };
}, { requiredRole: "member", },);
