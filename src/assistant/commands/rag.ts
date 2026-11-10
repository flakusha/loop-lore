// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /rag-search, /rag-ask — RAG retrieval over world/character lore.
 *
 * Searches world_lore_entries and actor_lore_entries using keyword matching,
 * plus the blind-token tier over `*_lore_search_tokens` when
 * `ENABLE_TOKEN_INDEXING=1` (silent no-op otherwise — same contract as the
 * message tier in `src/search/`). When the RAG epic lands, swap to FTS5 over
 * the documents table.
 */

import type { Kysely, } from "kysely";
import { callAux, } from "../../aux-pipeline";
import type { DB, } from "../../db/schema";
import { resolveSystemPrompt, } from "../../prompts";
import { requireWorldAccess, } from "../../routes/worlds/access";
import { type LoreTokenMatch, matchLoreEntriesByTokens, } from "../../search";
import { quotaGate, } from "../quota/gate";
import { type CommandResult, registerCommand, } from "./registry";

interface LoreHit {
  id: string;
  name: string;
  content: string;
  source: "world" | "actor";
  score: number;
  /** True when matched only via HMAC token (blind-index tier). */
  encryptedMatch?: boolean;
}

/**
 * Hydrate one domain's token matches into lore hits, applying the same
 * visibility filters as the keyword tier (enabled entries in this world).
 * @param db - typed Kysely instance
 * @param source - which lore table the matches came from
 * @param matches - token matches to hydrate
 * @param worldId - world ID for scoping
 * @returns lore hits scored by shared-token count
 */
async function hydrateTokenHits(
  db: Kysely<DB>,
  source: "world" | "actor",
  matches: LoreTokenMatch[],
  worldId: string,
): Promise<LoreHit[]> {
  if (matches.length === 0) { return []; }
  const ids = matches.map((m,) => m.entryId);
  const rows = source === "world"
    ? await db.selectFrom("world_lore_entries",)
      .select(["id", "name", "content",],)
      .where("id", "in", ids,)
      .where("world_id", "=", worldId,)
      .where("enabled", "=", "enabled",)
      .execute()
    : await db.selectFrom("actor_lore_entries",)
      .select(["id", "name", "content",],)
      .where("id", "in", ids,)
      .where("world_id", "=", worldId,)
      .where("enabled", "=", "enabled",)
      .execute();

  return rows.map((row,) => ({
    id: row.id,
    name: row.name ?? "",
    content: row.content,
    source,
    score: matches.find((m,) => m.entryId === row.id)?.hits ?? 1,
    encryptedMatch: true,
  }));
}

/**
 * Search lore entries for keyword matches.
 * @param db - typed Kysely instance
 * @param query - search query
 * @param worldId - world ID for scoping
 * @returns ranked lore hits
 */
async function searchLore(db: Kysely<DB>, query: string, worldId: string,): Promise<LoreHit[]> {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/,).filter((t,) => t.length > 0);
  if (terms.length === 0) { return []; }

  const worldRows = await db
    .selectFrom("world_lore_entries",)
    .select(["id", "name", "content",],)
    .where("world_id", "=", worldId,)
    .where("enabled", "=", "enabled",)
    .execute();

  const actorRows = await db
    .selectFrom("actor_lore_entries",)
    .select(["id", "name", "content",],)
    .where("world_id", "=", worldId,)
    .where("enabled", "=", "enabled",)
    .execute();

  const hits: LoreHit[] = [];
  for (const row of worldRows) {
    const text = `${row.name} ${row.content}`.toLowerCase();
    const score = terms.filter((t,) => text.includes(t,)).length;
    if (score > 0) { hits.push({ id: row.id, name: row.name ?? "", content: row.content, source: "world", score, },); }
  }

  for (const row of actorRows) {
    const text = `${row.name} ${row.content}`.toLowerCase();
    const score = terms.filter((t,) => text.includes(t,)).length;
    if (score > 0) { hits.push({ id: row.id, name: row.name ?? "", content: row.content, source: "actor", score, },); }
  }

  // Token tier (ENABLE_TOKEN_INDEXING): blind-token matches over the lore
  // search-token tables, derived with the world owner's key. Silent no-op
  // when the flag is off or the owner has no usable secret — same contract
  // as the message token tier. Keyword hits win on id collisions (their
  // score already counts the matched terms).
  const seen = new Set(hits.map((h,) => h.id),);
  const tokenMatches = (await matchLoreEntriesByTokens(db, { worldId, query, },))
    .filter((m,) => !seen.has(m.entryId,));

  const tokenHits = [
    ...await hydrateTokenHits(
      db,
      "world",
      tokenMatches.filter((m,) => m.source === "world"),
      worldId,
    ),
    ...await hydrateTokenHits(
      db,
      "actor",
      tokenMatches.filter((m,) => m.source === "actor"),
      worldId,
    ),
  ];

  return [...hits, ...tokenHits,].sort((a, b,) => b.score - a.score).slice(0, 10,);
}

registerCommand("rag-search", async (args, ctx,): Promise<CommandResult> => {
  const quota = quotaGate(ctx.userId ?? null, "rag-search",);
  if (quota) { return quota; }

  const query = args.join(" ",).trim();
  if (!query) {
    return { systemMessage: "Usage: /rag-search <query>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**RAG unavailable:** command context missing database.", handled: true, };
  }

  const worldId = ctx.activeChat?.worldId ?? "default";
  const denied = await requireWorldAccess(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (denied) {
    return { systemMessage: "**Access denied:** cannot search documents in this world.", handled: true, };
  }

  const hits = await searchLore(db, query, worldId,);
  if (hits.length === 0) {
    return { systemMessage: `No results for "${query}".`, handled: true, };
  }

  const formatted = hits.map((h,) => {
    const excerpt = h.content.slice(0, 200,);
    return `- **${h.name}** (${h.source}): ${excerpt}`;
  },).join("\n",);

  return {
    systemMessage: `**RAG Results (${hits.length}):**\n\n${formatted}`,
    action: "rag-results",
    actionPayload: { hits, },
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["read-lore", "cross-user",], },);

registerCommand("rag-ask", async (args, ctx,): Promise<CommandResult> => {
  const quota = quotaGate(ctx.userId ?? null, "rag-ask",);
  if (quota) { return quota; }

  const query = args.join(" ",).trim();
  if (!query) {
    return { systemMessage: "Usage: /rag-ask <question>", handled: true, };
  }

  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**RAG unavailable:** command context missing database.", handled: true, };
  }

  const config = ctx.config;
  if (!config) {
    return { systemMessage: "**RAG unavailable:** command context missing config.", handled: true, };
  }

  const worldId = ctx.activeChat?.worldId ?? "default";
  const denied = await requireWorldAccess(db, worldId, ctx.userId ?? null, ctx.userRole ?? null,);
  if (denied) {
    return { systemMessage: "**Access denied:** cannot search documents in this world.", handled: true, };
  }

  const hits = await searchLore(db, query, worldId,);
  if (hits.length === 0) {
    return { systemMessage: `No results for "${query}".`, handled: true, };
  }

  const context = hits.map((h,) => `[${h.source}] ${h.name}: ${h.content}`).join("\n\n",);
  // ragAsk resolves the answer base; the retrieved context is appended here.
  const messages = [
    {
      role: "system" as const,
      content: `${resolveSystemPrompt(config.templates?.llm, "ragAsk",)}\n\nContext:\n${context}`,
    },
    { role: "user" as const, content: query, },
  ];

  const result = await callAux("rag-ask", config, db, messages, {
    userId: ctx.userId,
    chatId: ctx.chatId,
  },);

  if (!result) {
    return { systemMessage: "**RAG unavailable:** no answer service configured.", handled: true, };
  }

  const citations = hits.map((h,) => `${h.name} (${h.source})`).join(", ",);
  return {
    systemMessage: `${result.content}\n\n**Sources:** ${citations}`,
    action: "rag-answer",
    actionPayload: { answer: result.content, citations: hits, },
    handled: true,
  };
}, { requiredRole: "member", capabilities: ["read-lore", "network", "cross-user",], },);
