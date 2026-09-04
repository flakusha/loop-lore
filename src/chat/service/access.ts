// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat access control and online-state (key mechanics) checks.
 *
 * Two layered helpers:
 *   - `checkChatAccess` — broad read/join/leave access: admin, creator, or any
 *     participant. Used by message-seen, exports, participant-management.
 *   - `checkChatSettingsAccess` — stricter authority required to mutate chat
 *     settings (mode, turnStrategy, worldId, gmConfig, renderingOverride,
 *     name, pinned, paused, etc.) per `docs/spec/chat-privacy.md` §5.1.
 *     Only admin OR the chat creator OR `role_in_chat = "owner"` passes.
 *
 * Both helpers return the same `{ ok: true } | { ok: false, error }` shape so
 * callers can drop in the appropriate variant without changing control flow.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import type { ServiceError, } from "./types";

/**
 * Names of the key-mechanic update params that are immutable once a chat is
 * online. Changing these requires migrating to a new chat bound to a different
 * template (see `migrateChat`).
 *
 * Mirrors .plan/epics/epic-config-templates.md §3.1.
 */
export const KEY_MECHANIC_PARAMS = [
  "mode",
  "turnStrategy",
  "worldId",
  "gmConfig",
  "renderingOverride",
] as const;

/** */
export type KeyMechanicParam = (typeof KEY_MECHANIC_PARAMS)[number];

/**
 * Broad chat-access check: admin, creator, or any participant.
 * @param database
 * @param chatId
 * @param userId
 * @param userRole
 * @returns if access granted, or { ok: false, error } with reason
 */
export async function checkChatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  if (can(userRole, "admin.chat",) || chat.created_by === userId) {
    return { ok: true, };
  }

  const participant = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();

  if (!participant) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  return { ok: true, };
}

/**
 * Strict settings-access check. Per `docs/spec/chat-privacy.md` §5.1 only the
 * Master (chat creator) or a GM may change settings. The DB enum
 * (`ChatParticipantRole`) currently exposes `Owner` instead of `Master`; we
 * treat `Owner` as the Master equivalent until the spec's `gm` role lands.
 *
 * Members/observers/guests are denied even when they pass `checkChatAccess`.
 * @param database
 * @param chatId
 * @param userId
 * @param userRole
 * @returns if settings-mutation is granted, else { ok: false, error }
 */
export async function checkChatSettingsAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  if (can(userRole, "admin.chat",)) {
    return { ok: true, };
  }

  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  if (chat.created_by === userId) {
    return { ok: true, };
  }

  const ownerParticipant = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .where("role_in_chat", "=", "owner",)
    .executeTakeFirst();

  if (ownerParticipant) {
    return { ok: true, };
  }

  return {
    ok: false,
    error: { code: "forbidden", message: "Only the chat creator or an Owner role can change settings", },
  };
}

/**
 * Determine whether a chat is "online" — i.e. has at least one confirmed
 * message. Before that it is a draft and key mechanics remain editable.
 * @param database
 * @param chatId
 */
export async function isChatOnline(
  database: Kysely<DB>,
  chatId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("messages",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .where("status", "=", "confirmed",)
    .limit(1,)
    .executeTakeFirst();
  return row !== undefined;
}
