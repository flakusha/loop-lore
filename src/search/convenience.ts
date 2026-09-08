// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * One-call search conveniences — the acceptance-criterion surface.
 *
 * `searchMessages`, `searchMemories`, and `searchAssets` wire the real
 * DB-backed providers into the unified service with default time caps, so
 * routes, the assistant, and chat context injection call one function
 * instead of assembling providers by hand.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import type { SearchTimeCapConfig, } from "./config";
import { type AssetHit, createAssetProviders, } from "./providers/assets";
import { createMemoryProviders, type MemoryHit, } from "./providers/memories";
import { createMessageProviders, type MessageHit, } from "./providers/messages";
import { createUnifiedSearchService, } from "./service";
import type { SearchHit, SearchMode, } from "./types";

/** Default caps: typical queries snappy, slow tiers aborted with partials. */
export const DEFAULT_SEARCH_CAPS: SearchTimeCapConfig = {
  global: { defaultMs: 500, maxMs: 2000, },
};

/** Paging + mode options shared by all conveniences. */
export interface ConvenienceOpts {
  /** Tier to run. Defaults to "hybrid" where supported, else per-surface default. */
  mode?: SearchMode;
  /** Max hits. Defaults to 20. */
  topK?: number;
  /** Minimum score in [0, 1]. */
  minScore?: number;
  /** Per-call timeout override in ms. */
  timeoutMs?: number;
  /** Time-cap ladder override. */
  timeCaps?: SearchTimeCapConfig;
}

/**
 * Search chat messages (exact / keyword / hybrid + encrypted-token).
 * @param db - typed Kysely instance
 * @param q - raw user input
 * @param opts - scope (userId, optional chatId/isAdmin) + paging
 * @returns ranked message hits
 */
export async function searchMessages(
  db: Kysely<DB>,
  q: string,
  opts: ConvenienceOpts & {
    userId: string;
    chatId?: string;
    isAdmin?: boolean;
    includeEncrypted?: boolean;
    resolveKey?: (userId: string,) => Promise<string | null>;
  },
): Promise<SearchHit<MessageHit>[]> {
  const providers = createMessageProviders(db, { resolveKey: opts.resolveKey, },);
  const service = createUnifiedSearchService({
    providers: { exact: providers.exact, keyword: providers.keyword, token: providers.token, },
    timeCaps: opts.timeCaps ?? DEFAULT_SEARCH_CAPS,
  },);
  return service.search(
    {
      q,
      mode: opts.mode ?? "keyword",
      topK: opts.topK,
      minScore: opts.minScore,
      includeEncrypted: opts.includeEncrypted,
    },
    { kind: "messages", userId: opts.userId, chatId: opts.chatId, isAdmin: opts.isAdmin, },
    { timeoutMs: opts.timeoutMs, },
  ) as Promise<SearchHit<MessageHit>[]>;
}

/**
 * Search one actor's memories (keyword / vector / hybrid).
 * @param db - typed Kysely instance
 * @param q - raw user input
 * @param opts - scope (actorId) + paging
 * @returns ranked memory hits
 */
export async function searchMemories(
  db: Kysely<DB>,
  q: string,
  opts: ConvenienceOpts & {
    actorId: string;
    embedQuery?: (text: string,) => Promise<Float32Array>;
  },
): Promise<SearchHit<MemoryHit>[]> {
  const providers = createMemoryProviders(db, { embedQuery: opts.embedQuery, },);
  const service = createUnifiedSearchService({
    providers: { keyword: providers.keyword, vector: providers.vector, },
    timeCaps: opts.timeCaps ?? DEFAULT_SEARCH_CAPS,
  },);
  return service.search(
    { q, mode: opts.mode ?? "hybrid", topK: opts.topK, minScore: opts.minScore, },
    { kind: "memories", actorId: opts.actorId, },
    { timeoutMs: opts.timeoutMs, },
  ) as Promise<SearchHit<MemoryHit>[]>;
}

/**
 * Search visible assets (exact / fuzzy).
 * @param db - typed Kysely instance
 * @param q - raw user input (file name or description)
 * @param opts - scope (userId, role, visibility) + paging
 * @returns ranked asset hits
 */
export async function searchAssets(
  db: Kysely<DB>,
  q: string,
  opts: ConvenienceOpts & {
    userId: string;
    userRole?: string | null;
    isAdmin?: boolean;
    visibility?: "public" | "private" | "shared";
    assetType?: string;
  },
): Promise<SearchHit<AssetHit>[]> {
  const providers = createAssetProviders(db, opts.userRole ?? null,);
  const service = createUnifiedSearchService({
    providers: { exact: providers.exact, fuzzy: providers.fuzzy, keyword: providers.fuzzy, },
    timeCaps: opts.timeCaps ?? DEFAULT_SEARCH_CAPS,
  },);
  return service.search(
    {
      q,
      mode: opts.mode ?? "fuzzy",
      topK: opts.topK,
      minScore: opts.minScore,
      filters: opts.assetType === undefined ? undefined : { assetType: opts.assetType, },
    },
    { kind: "assets", userId: opts.userId, isAdmin: opts.isAdmin, visibility: opts.visibility, },
    { timeoutMs: opts.timeoutMs, },
  ) as Promise<SearchHit<AssetHit>[]>;
}
