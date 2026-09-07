// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persisted NSFW consent ledger (`nsfw_consent_state`, migration 069).
 *
 * Append-only: every explicit user action (given/revoked) inserts a row.
 * The latest row per (user, chat) is the source of truth; `recordNsfwConsent`
 * stamps `revoked_at` on prior open `given` rows so `hasActiveConsent` has a
 * unique signal row.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";

/** Default scope for NSFW encounters; matches the existing in-memory consent. */
const DEFAULT_SCOPE = "nsfw_encounter";

/** Cap on free-form reason text; prevents log-injection style overflow. */
const REASON_MAX_CHARS = 500;

/** Single source of truth for the consent action enum. */
type ConsentAction = "given" | "revoked";

/** DB row shape from `nsfw_consent_state` (camel-cased projection). */
export interface ConsentStateRow {
  id: string;
  userId: string;
  chatId: string;
  action: ConsentAction;
  scope: string;
  reason: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/**
 * Read the latest persisted consent row for (userId, chatId). Returns
 * `null` if the user has never explicitly consented nor revoked.
 * @param database
 * @param chatId
 * @param userId
 */
export async function getLatestConsent(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
): Promise<ConsentStateRow | null> {
  const row = await database
    .selectFrom("nsfw_consent_state",)
    .selectAll()
    .where("user_id", "=", userId,)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(1,)
    .executeTakeFirst();

  if (!row) { return null; }
  return {
    id: row.id,
    userId: row.user_id,
    chatId: row.chat_id,
    action: row.action as ConsentAction,
    scope: row.scope,
    reason: row.reason ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
  };
}

/**
 * Pure predicate: row is a `given` action with no `revoked_at` stamp.
 * @param row
 */
export function hasActiveConsent(row: ConsentStateRow | null,): boolean {
  return row?.action === "given" && row.revokedAt === null;
}

/**
 * Trim or null a free-form reason to keep the audit trail bounded.
 * @param reason
 */
function sanitizeReason(reason: string | undefined,): string | null {
  if (!reason) { return null; }
  return reason.slice(0, REASON_MAX_CHARS,);
}

/** */
export interface RecordNsfwConsentOptions {
  database: Kysely<DB>;
  chatId: string;
  userId: string;
  action: ConsentAction;
  reason?: string;
  scope?: string;
}

/**
 * Record an explicit user consent action. Persists to `nsfw_consent_state`
 * and stamps `revoked_at` on prior open `given` rows so `hasActiveConsent`
 * has a unique source-of-truth row.
 * @param options
 */
export async function recordNsfwConsent(
  options: RecordNsfwConsentOptions,
): Promise<ConsentStateRow> {
  const { database, chatId, userId, action, } = options;
  const scope = options.scope ?? DEFAULT_SCOPE;
  const reason = sanitizeReason(options.reason,);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // INSERT + UPDATE are wrapped in a single transaction so two concurrent
  // `given` requests cannot revoke each other's rows (BUG-nsfw-recordnsfwconsent).
  await database.transaction().execute(async (trx,) => {
    await trx
      .insertInto("nsfw_consent_state",)
      .values({
        id,
        user_id: userId,
        chat_id: chatId,
        action,
        scope,
        reason,
        created_at: now,
        revoked_at: null,
      },)
      .execute();

    // Whatever the new action, close any prior open `given` rows so the latest
    // row is the unique signal for `hasActiveConsent`.
    await trx
      .updateTable("nsfw_consent_state",)
      .set({ revoked_at: now, },)
      .where("user_id", "=", userId,)
      .where("chat_id", "=", chatId,)
      .where("action", "=", "given",)
      .where("revoked_at", "is", null,)
      .where("id", "!=", id,)
      .execute();
  },);

  return {
    id,
    userId,
    chatId,
    action,
    scope,
    reason,
    createdAt: now,
    revokedAt: action === "revoked" ? now : null,
  };
}
