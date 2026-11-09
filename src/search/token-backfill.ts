// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Streaming backfill of blind search tokens for existing server-encrypted
 * messages (TASK-encrypted-search-minimal-first-slice).
 *
 * Candidates are `messages` rows the FTS5 tier cannot see: `content_plaintext
 * IS NULL` with a `key_id`. Each row is decrypted with the process SMK and
 * reindexed under the chat owner's `users.encryption_secret` + id, which is
 * exactly the (key, scope) pair the `token` tier resolves on reads.
 *
 * Idempotent: writes replace all token rows per message (reindexMessageTokens).
 * Runs are resumable: batches advance a `rowid` cursor the caller can pass
 * back via `afterRowid`.
 */
import { type Kysely, sql, } from "kysely";
import { decryptMessageContent, getSmk, } from "../crypto";
import { isUsableEncryptionSecret, } from "../crypto/user-secret";
import type { DB, } from "../db/schema";
import { getChildLogger, type Logger, } from "../logger";
import { reindexMessageTokens, } from "./token-store";

/**
 * Module logger accessor — null until a host process seeds the global logger.
 * @returns the child logger, or null when no logger is initialized.
 */
const log = (): Logger | null => getChildLogger("search/token-backfill",);

/** Counts describing one backfill pass. */
export interface BackfillTokensSummary {
  /** Encrypted-without-mirror rows considered (the only candidates). */
  candidates: number;
  /** Messages whose tokens were (or on a dry run, would be) written. */
  indexed: number;
  /** Candidates skipped: chat tier `none` or owner secret unusable. */
  skipped: number;
  /** Candidates whose ciphertext could not be decrypted (counted, not guessed). */
  undecryptable: number;
  /** rowid of the last processed candidate — pass to `afterRowid` to resume. */
  cursor: number;
  /** True when no write was attempted. */
  dryRun: boolean;
}

/** Options for {@link backfillMessageTokens}. */
export interface BackfillTokensOpts {
  /** Report the work without writing (default false). */
  dryRun?: boolean;
  /** Messages per batch (default 500, the ticket's batch size). */
  batchSize?: number;
  /** Max batches this run processes; 0 = until exhausted (default 0). */
  maxBatches?: number;
  /** rowid cursor from a previous run's summary (default 0). */
  afterRowid?: number;
}

/** One candidate row joined with its chat's tier + owner. */
interface CandidateRow {
  id: string;
  chat_id: string;
  content: string;
  content_encoding: string;
  key_id: string;
  encryption_level: string;
  created_by: string;
}

/**
 * Backfill blind search tokens for existing server-encrypted messages.
 *
 * Requires an armed SMK (`getSmk()` non-null): candidates are decrypted with
 * it. Unlike the live write path, this does not consult
 * `ENABLE_TOKEN_INDEXING` — running the backfill IS the opt-in.
 * @param db - typed Kysely instance
 * @param opts - dry-run / batching / resume controls
 * @returns counts of candidates, indexed rows, skips, and the resume cursor
 */
export async function backfillMessageTokens(
  db: Kysely<DB>,
  opts: BackfillTokensOpts = {},
): Promise<BackfillTokensSummary> {
  const batchSize = opts.batchSize ?? 500;
  const maxBatches = opts.maxBatches ?? 0;
  const dryRun = opts.dryRun === true;

  const summary: BackfillTokensSummary = {
    candidates: 0,
    indexed: 0,
    skipped: 0,
    undecryptable: 0,
    cursor: opts.afterRowid ?? 0,
    dryRun,
  };

  const total = await countCandidates(db, summary.cursor,);
  log()?.info("backfill: starting", { total, cursor: summary.cursor, dryRun, },);
  const decile = Math.max(1, Math.floor(total / 10,),);

  // Owner secrets are cached per user: one lookup per chat owner, not per row.
  const secretCache = new Map<string, string | null>();

  for (let batch = 0; maxBatches === 0 || batch < maxBatches; batch++) {
    const rows = await loadBatch(db, batchSize, summary.cursor,);
    if (rows.length === 0) { break; }

    for (const row of rows) {
      summary.candidates += 1;
      summary.cursor = Math.max(summary.cursor, await cursorOf(db, row.id,),);

      if (row.encryption_level === "none") {
        summary.skipped += 1;
        continue;
      }

      const secret = await resolveOwnerSecret(db, secretCache, row.created_by,);
      if (secret === null) {
        summary.skipped += 1;
        continue;
      }

      const plaintext = await decryptCandidate(db, row,);
      if (plaintext === null) {
        summary.undecryptable += 1;
        continue;
      }

      if (dryRun !== true) {
        await reindexMessageTokens(db, row.id, plaintext, secret, row.created_by,);
      }

      summary.indexed += 1;
      if (summary.candidates % decile === 0) {
        log()?.info("backfill: progress", {
          candidates: summary.candidates,
          indexed: summary.indexed,
          cursor: summary.cursor,
        },);
      }
    }

    log()?.info("backfill: batch done", {
      candidates: summary.candidates,
      cursor: summary.cursor,
    },);
  }

  return summary;
}

/**
 * Load one rowid-ordered batch of candidates above a cursor.
 * @param db - typed Kysely instance
 * @param batchSize - rows per batch
 * @param afterRowid - exclusive rowid lower bound
 * @returns the batch's candidate rows
 */
async function loadBatch(
  db: Kysely<DB>,
  batchSize: number,
  afterRowid: number,
): Promise<CandidateRow[]> {
  return await db
    .selectFrom("messages",)
    .innerJoin("chats", "chats.id", "messages.chat_id",)
    .select([
      "messages.id",
      "messages.chat_id",
      "messages.content",
      "messages.content_encoding",
      "messages.key_id",
      "chats.encryption_level",
      "chats.created_by",
    ],)
    .where("messages.content_plaintext", "is", null,)
    .where("messages.key_id", "is not", null,)
    // rowid is not a schema column: raw ref (qualified — the join makes an
    // unqualified rowid ambiguous between messages and chats).
    .where(sql<boolean>`messages.rowid > ${afterRowid}`,)
    .orderBy(sql`messages.rowid`, "asc",)
    .limit(batchSize,)
    .execute() as unknown as CandidateRow[];
}

/**
 * Count the remaining candidates above a resume cursor.
 * @param db - typed Kysely instance
 * @param afterRowid - exclusive rowid lower bound
 * @returns number of candidate rows still to process
 */
async function countCandidates(db: Kysely<DB>, afterRowid: number,): Promise<number> {
  const row = await db
    .selectFrom("messages",)
    .innerJoin("chats", "chats.id", "messages.chat_id",)
    .select((eb,) => eb.fn.countAll<string>().as("total",))
    .where("messages.content_plaintext", "is", null,)
    .where("messages.key_id", "is not", null,)
    .where(sql<boolean>`messages.rowid > ${afterRowid}`,)
    .executeTakeFirst();

  return Number(row?.total ?? 0,);
}

/**
 * Resolve a message id to its rowid cursor value.
 * @param db - typed Kysely instance
 * @param messageId - messages.id
 * @returns the row's rowid (0 when the row vanished mid-run)
 */
async function cursorOf(db: Kysely<DB>, messageId: string,): Promise<number> {
  const row = await db
    .selectFrom("messages",)
    .select(sql<number>`rowid`.as("rowid",),)
    .where("id", "=", messageId,)
    .executeTakeFirst() as { rowid?: number } | undefined;

  return row?.rowid ?? 0;
}

/**
 * Get the chat owner's usable encryption secret, caching per owner.
 * @param db - typed Kysely instance
 * @param cache - per-run secret cache keyed by user id
 * @param ownerId - chats.created_by of the candidate's chat
 * @returns the hex secret, or null when absent/malformed
 */
async function resolveOwnerSecret(
  db: Kysely<DB>,
  cache: Map<string, string | null>,
  ownerId: string,
): Promise<string | null> {
  const cached = cache.get(ownerId,);
  if (cached !== undefined) { return cached; }

  const owner = await db
    .selectFrom("users",)
    .select("encryption_secret",)
    .where("id", "=", ownerId,)
    .executeTakeFirst();

  const secret = isUsableEncryptionSecret(owner?.encryption_secret ?? null,)
    ? owner!.encryption_secret!
    : null;

  cache.set(ownerId, secret,);

  return secret;
}

/**
 * Decrypt one candidate row, or null when the payload is undecryptable.
 * @param db - typed Kysely instance
 * @param row - candidate row (requires an armed SMK)
 * @returns plaintext, or null on any decryption failure
 */
async function decryptCandidate(db: Kysely<DB>, row: CandidateRow,): Promise<string | null> {
  try {
    return await decryptMessageContent(db, {
      content: row.content,
      content_encoding: row.content_encoding,
      key_id: row.key_id,
      chat_id: row.chat_id,
    }, getSmk()!,);
  } catch {
    return null;
  }
}
