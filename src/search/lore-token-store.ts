// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ciphertext-token persistence for the lorebook domain (`099_lore_search_tokens`).
 *
 * Lore-domain twin of `./token-store`: derive blind tokens via
 * `deriveSearchTokens` with the entry owner's `users.encryption_secret` and
 * store them under that owner id (`scope`). Lore rows live in two tables
 * and a SQLite FK references one table only, so the store splits per
 * domain: `world_lore_search_tokens` (FK → `world_lore_entries`, cascade)
 * and `actor_lore_search_tokens` (FK → `actor_lore_entries`, cascade).
 * Message-token reads go through `matchMessageIdsByTokens`
 * (`message_search_tokens` only); lore-token reads go through
 * `matchLoreIdsByTokens` / `matchLoreEntriesByTokens` (these tables only) —
 * the domains cannot see each other's rows.
 *
 * Kysely types only — no runtime DB imports (mirrors `./token-store`).
 */
import { type Kysely, sql, } from "kysely";
import { isUsableEncryptionSecret, } from "../crypto/user-secret";
import type { DB, } from "../db/schema";
import { getChildLogger, type Logger, } from "../logger";
import { deriveSearchTokens, } from "./encrypted-tokens";
import { isTokenIndexingEnabled, } from "./token-store";

/** Lore-domain token tables, one per lore row table (FK targets differ). */
export type LoreTokenTable = "world_lore_search_tokens" | "actor_lore_search_tokens";

/** Lore domain discriminator (entry table + owner resolution). */
export type LoreDomain = "world" | "actor";

/** Token table backing each lore domain. */
const TOKEN_TABLE: Record<LoreDomain, LoreTokenTable> = {
  world: "world_lore_search_tokens",
  actor: "actor_lore_search_tokens",
};

/** Input for {@link indexWorldLoreSearchTokens} / {@link indexActorLoreSearchTokens}. */
export interface IndexLoreTokensOpts {
  /** Persisted lore-entry row id (its FK target must already exist). */
  entryId: string;
}

/** One token-matched lore entry, ranked by shared-token count. */
export interface LoreTokenMatch {
  /** Owning lore-entry row id. */
  entryId: string;
  /** How many query tokens hit this entry. */
  hits: number;
}

/** One token-matched lore entry with its domain, ready for hit hydration. */
export interface LoreTokenSearchHit extends LoreTokenMatch {
  /** Which lore table the match came from. */
  source: LoreDomain;
}

/** Options for {@link matchLoreEntriesByTokens}. */
export interface LoreTokenSearchOpts {
  /** World whose owner keys and scopes the derivation. */
  worldId: string;
  /** Raw search query (tokenized/normalized here). */
  query: string;
  /** Max matched entries per domain. Defaults to 10. */
  limit?: number;
}

/**
 * Module logger accessor — null until a host process seeds the global logger.
 * @returns the child logger, or null when no logger is initialized.
 */
const log = (): Logger | null => getChildLogger("search/lore-token-store",);

/**
 * Replace all stored tokens for one lore entry with a fresh derivation.
 * @param db - typed Kysely instance
 * @param table - which lore token table to write
 * @param entryId - owning lore-entry row
 * @param plaintext - entry searchable plaintext (name + content)
 * @param userKey - owner's `users.encryption_secret`
 * @param scope - owner user id (isolates per-user tokens on lookup)
 * @returns number of tokens stored (0 when plaintext yields none)
 */
export async function reindexLoreTokens(
  db: Kysely<DB>,
  table: LoreTokenTable,
  entryId: string,
  plaintext: string,
  userKey: string | Uint8Array,
  scope: string,
): Promise<number> {
  await db.deleteFrom(table,).where("entry_id", "=", entryId,).execute();
  const tokens = await deriveSearchTokens(plaintext, userKey,);
  if (tokens.length === 0) { return 0; }
  await db
    .insertInto(table,)
    .values(tokens.map((term,) => ({ entry_id: entryId, term, scope, })),)
    .execute();

  return tokens.length;
}

/**
 * Find lore entries sharing the most tokens with the query set, in one domain.
 * @param db - typed Kysely instance
 * @param table - which lore token table to read
 * @param tokens - derived query tokens (same key + scope as stored rows)
 * @param scope - owner user id to restrict the lookup to
 * @param limit - max entries to return
 * @returns matches ordered by shared-token count descending
 */
export async function matchLoreIdsByTokens(
  db: Kysely<DB>,
  table: LoreTokenTable,
  tokens: string[],
  scope: string,
  limit = 50,
): Promise<LoreTokenMatch[]> {
  if (tokens.length === 0) { return []; }
  const rows = await db
    .selectFrom(table,)
    .select(["entry_id", sql<number>`count(*)`.as("hits",),],)
    .where("scope", "=", scope,)
    .where("term", "in", tokens,)
    .groupBy("entry_id",)
    .orderBy(sql`count(*)`, "desc",)
    .limit(limit,)
    .execute();

  return rows.map((row,) => ({ entryId: row.entry_id, hits: Number(row.hits,), }));
}

/**
 * Token-tier lore lookup for the `/rag-search` surface: derive query tokens
 * with the world owner's secret and match both lore domains scoped to that
 * owner. Silent no-op — `[]` — unless `ENABLE_TOKEN_INDEXING=1`, mirroring
 * the message tier's flag contract.
 * @param db - typed Kysely instance
 * @param opts - world id, raw query, per-domain limit
 * @returns token-matched entries across both lore domains (flag off: always empty)
 */
export async function matchLoreEntriesByTokens(
  db: Kysely<DB>,
  opts: LoreTokenSearchOpts,
): Promise<LoreTokenSearchHit[]> {
  if (isTokenIndexingEnabled() !== true) { return []; }
  const world = await db
    .selectFrom("worlds",)
    .select("owner_id",)
    .where("id", "=", opts.worldId,)
    .executeTakeFirst();

  const secret = await ownerEncryptionSecret(db, world?.owner_id ?? null,);
  if (secret === null || world === undefined) { return []; }
  const tokens = await deriveSearchTokens(opts.query, secret,);
  if (tokens.length === 0) { return []; }
  const limit = opts.limit ?? 10;
  const worldMatches = await matchLoreIdsByTokens(
    db,
    TOKEN_TABLE.world,
    tokens,
    world.owner_id,
    limit,
  );

  const actorMatches = await matchLoreIdsByTokens(
    db,
    TOKEN_TABLE.actor,
    tokens,
    world.owner_id,
    limit,
  );

  return [
    ...worldMatches.map((m,) => ({ ...m, source: "world" as const, })),
    ...actorMatches.map((m,) => ({ ...m, source: "actor" as const, })),
  ];
}

/**
 * Index blind search tokens for one world lore entry (write side of the
 * lore token tier). Skipped — without error — when the flag is off, the
 * entry row is missing, or the world owner has no usable
 * `users.encryption_secret`. Tokens are blinded with the world owner's key
 * and stored under their id, so owner searches match.
 *
 * Fail-open by contract: an indexing failure logs a warning and returns 0 —
 * search is secondary and must never break a lore write.
 * @param db - typed Kysely instance
 * @param opts - persisted entry id
 * @returns number of token rows written (0 on any skip)
 * @remarks call only AFTER the `world_lore_entries` row exists (the token
 * table carries a hard FK with cascade).
 */
export async function indexWorldLoreSearchTokens(
  db: Kysely<DB>,
  opts: IndexLoreTokensOpts,
): Promise<number> {
  if (isTokenIndexingEnabled() !== true) { return 0; }
  return await indexLoreDomain(db, "world", opts,);
}

/**
 * Index blind search tokens for one actor lore entry (write side of the
 * lore token tier). Same contract as {@link indexWorldLoreSearchTokens},
 * keyed by the actor's `owner_id` (entries whose actor has no owner are
 * skipped — no key to blind with).
 * @param db - typed Kysely instance
 * @param opts - persisted entry id
 * @returns number of token rows written (0 on any skip)
 * @remarks call only AFTER the `actor_lore_entries` row exists.
 */
export async function indexActorLoreSearchTokens(
  db: Kysely<DB>,
  opts: IndexLoreTokensOpts,
): Promise<number> {
  if (isTokenIndexingEnabled() !== true) { return 0; }
  return await indexLoreDomain(db, "actor", opts,);
}

/**
 * One domain's indexing pass: resolve the entry row + its owner, derive and
 * store tokens under that owner. Fail-open — any failure logs a warning and
 * returns 0 so a lore write never breaks on secondary search indexing.
 * @param db - typed Kysely instance
 * @param domain - which lore table + owner resolution to use
 * @param opts - persisted entry id
 * @returns number of token rows written (0 on any skip)
 */
async function indexLoreDomain(
  db: Kysely<DB>,
  domain: LoreDomain,
  opts: IndexLoreTokensOpts,
): Promise<number> {
  try {
    const resolved = await resolveLoreOwnerText(db, domain, opts.entryId,);
    if (resolved === null) { return 0; }

    const secret = await ownerEncryptionSecret(db, resolved.ownerId,);
    if (secret === null) { return 0; }

    return await reindexLoreTokens(
      db,
      TOKEN_TABLE[domain],
      opts.entryId,
      resolved.text,
      secret,
      resolved.ownerId!,
    );
  } catch (error) {
    log()?.warn("lore token indexing failed (search stays stale)", {
      domain,
      entryId: opts.entryId,
      err: error instanceof Error ? error.message : String(error,),
    },);

    return 0;
  }
}

/** Entry searchable plaintext + its owner, resolved per domain. */
interface LoreOwnerText {
  /** Owning user id (`worlds.owner_id` / `actors.owner_id`), or null. */
  ownerId: string | null;
  /** Name + content — the same surface `/rag-search` keyword-scores. */
  text: string;
}

/**
 * Load one lore entry's searchable text and resolve its owning user.
 * @param db - typed Kysely instance
 * @param domain - which lore table + owner resolution to use
 * @param entryId - persisted lore-entry row id
 * @returns owner + text, or null when the entry row is missing
 */
async function resolveLoreOwnerText(
  db: Kysely<DB>,
  domain: LoreDomain,
  entryId: string,
): Promise<LoreOwnerText | null> {
  if (domain === "world") {
    const entry = await db
      .selectFrom("world_lore_entries",)
      .select(["name", "content", "world_id",],)
      .where("id", "=", entryId,)
      .executeTakeFirst();

    if (entry === undefined) { return null; }
    const world = await db
      .selectFrom("worlds",)
      .select("owner_id",)
      .where("id", "=", entry.world_id,)
      .executeTakeFirst();

    return { ownerId: world?.owner_id ?? null, text: `${entry.name ?? ""} ${entry.content}`, };
  }

  const entry = await db
    .selectFrom("actor_lore_entries",)
    .select(["name", "content", "actor_id",],)
    .where("id", "=", entryId,)
    .executeTakeFirst();

  if (entry === undefined) { return null; }
  const actor = await db
    .selectFrom("actors",)
    .select("owner_id",)
    .where("id", "=", entry.actor_id,)
    .executeTakeFirst();

  return { ownerId: actor?.owner_id ?? null, text: `${entry.name ?? ""} ${entry.content}`, };
}

/**
 * Resolve an owner's usable `users.encryption_secret`.
 * @param db - typed Kysely instance
 * @param ownerId - owner user id, or null when unknown
 * @returns the secret, or null when the owner is unknown/unkeyed
 */
async function ownerEncryptionSecret(
  db: Kysely<DB>,
  ownerId: string | null,
): Promise<string | null> {
  if (ownerId === null) { return null; }
  const row = await db
    .selectFrom("users",)
    .select("encryption_secret",)
    .where("id", "=", ownerId,)
    .executeTakeFirst();

  return isUsableEncryptionSecret(row?.encryption_secret ?? null,) === true
    ? row!.encryption_secret!
    : null;
}
