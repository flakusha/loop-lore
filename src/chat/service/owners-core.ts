// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Owners-set core: predicate + shared tx helpers
 * (epic-chat-multi-ownership). Pure plumbing — the add/remove operations
 * live in ./owners.ts; transfer integration in ./ownership.ts.
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { buildOwnersAuditMeta, type OwnersChangeEvent, } from "./owners-events";

/**
 * Owner predicate (post-cutover): a user holds owner authority exactly when
 * they have a `chat_owners` row. Every chat carries at least one row — the
 * 082 backfill covered existing chats and the create path seeds the creator
 * — so no `created_by` fallback remains.
 * @param {Kysely<DB>} database
 * @param {string} chatId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function isChatOwner(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("chat_owners",)
    .select("user_id",)
    .where("chat_id", "=", chatId,)
    .where("user_id", "=", userId,)
    .executeTakeFirst();

  return !!row;
}

/**
 * @param {Kysely<DB>} db
 * @param {string} chatId
 * @returns sorted owner user ids (chat_owners rows only)
 */
export async function listOwnerUserIds(db: Kysely<DB>, chatId: string,): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_owners",)
    .select("user_id",)
    .where("chat_id", "=", chatId,)
    .execute();

  return rows.map((r,) => r.user_id).sort();
}

/**
 * Materialize the creator's owners row when a chat predates the owners set
 * (no rows yet — created between the 082 backfill and the seeding cutover).
 * Idempotent; call inside the mutation transaction.
 * @param {Kysely<DB>} trx
 * @param {string} chatId
 * @param {string} creatorUserId
 * @returns {Promise<void>}
 */
export async function materializeCreatorOwnerRow(
  trx: Kysely<DB>,
  chatId: string,
  creatorUserId: string,
): Promise<void> {
  const existing = await trx
    .selectFrom("chat_owners",)
    .select("user_id",)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (existing) { return; }

  await trx
    .insertInto("chat_owners",)
    .values({ chat_id: chatId, user_id: creatorUserId, },)
    .execute();
}

/**
 * Resolve an ACTOR id to its owning user (persona `user_id`, adopted
 * character `owner_id`) — the transfer-path mapping.
 * @param {Kysely<DB>} db
 * @param {string} actorId
 * @returns {Promise<string | null>}
 */
export async function resolveActorOwningUser(
  db: Kysely<DB>,
  actorId: string,
): Promise<string | null> {
  const actor = await db
    .selectFrom("actors",)
    .select(["user_id", "owner_id",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  return actor?.user_id ?? actor?.owner_id ?? null;
}

/**
 * Demote a removed owner's participant row to member (mirror of the
 * transfer demotion). No-op when the user has no participant row.
 * @param {Kysely<DB>} trx
 * @param {string} chatId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function demoteOwnerParticipantRole(
  trx: Kysely<DB>,
  chatId: string,
  userId: string,
): Promise<void> {
  await trx
    .updateTable("chat_participants",)
    .set({ role_in_chat: ChatParticipantRole.Member, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .where("role_in_chat", "=", ChatParticipantRole.Owner,)
    .execute();
}

/**
 * One `log_entries` audit row for an owners-set change (same shape as the
 * transfer audit row).
 * @param {Kysely<DB>} trx
 * @param {OwnersChangeEvent} event
 * @param {string} now
 * @returns {Promise<void>}
 */
export async function writeOwnersAuditRow(
  trx: Kysely<DB>,
  event: OwnersChangeEvent,
  now: string,
): Promise<void> {
  await trx
    .insertInto("log_entries",)
    .values({
      id: crypto.randomUUID(),
      level: 30,
      timestamp: Date.now(),
      time: now,
      message: event.action === "chat_owner_added" ? "Chat owner added" : "Chat owner removed",
      module: "chat-ownership",
      user_id: event.performedBy,
      meta: buildOwnersAuditMeta(event,),
      event_type: event.action,
      entity_type: "chat",
      entity_id: event.chatId,
      created_at: now,
    },)
    .execute();
}
