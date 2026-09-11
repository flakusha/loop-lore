// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Party Join/Leave (C7 — group-chat VN party migration)
 *
 * Join/leave operations for group-chat party membership, with best-effort VN
 * narration. The VN narration writes a system-role "narration" message from
 * the narrator actor so the visual-novel timeline reflects the party-change
 * event when the chat is in VN mode.
 */
import type { Kysely, } from "kysely";
import { ChatParticipantRole, } from "../../db/enums";
import type { ChatRenderingOverride, } from "../../db/enums-core/chat";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";
import { resolveRendering, } from "../types/config";
import { injectPartyNarration, } from "./party-narration";
import type { ServiceError, } from "./types";

/** Parameters for a party join. */
export interface PartyJoinParams {
  chatId: string;
  actorId: string;
  /** Party role; defaults to "member". */
  role?: ChatParticipantRole;
}

/** Parameters for a party leave. */
export interface PartyLeaveParams {
  chatId: string;
  actorId: string;
}

/** Result of a backend party join/leave operation. */
export type PartyJoinResult =
  | ServiceError
  | { ok: true; participant: { actorId: string; role: ChatParticipantRole; talkativity: number } };

/** */
export type PartyLeaveResult =
  | ServiceError
  | { ok: true };

/**
 * Determine whether the chat is currently rendered as a visual novel by
 * resolving `gm_config.renderingOverride` (the typed source of truth)
 * against the ChatMode default. Replaces the legacy `chats.visual_novel`
 * integer column dropped in migration 076.
 * @param chat
 * @param chat.gm_config
 * @param chat.mode
 * @returns void
 */
function chatIsVisualNovel(chat: { gm_config: string | null; mode: string },): boolean {
  if (!chat.gm_config) { return false; }
  const parsed = safeJsonParse<{ renderingOverride?: ChatRenderingOverride | null }>(chat.gm_config,);
  const override: ChatRenderingOverride | null = parsed.ok
    ? (parsed.value.renderingOverride ?? null)
    : null;
  return resolveRendering(chat.mode as never, override,) === "visual_novel";
}

/**
 * Join a party: add a chat participant, returning the participant on success.
 * VN narration is emitted when the chat is in visual-novel mode.
 * @param database
 * @param params
 * @returns `{ ok: true, participant }` or a ServiceError.
 */
export async function joinParty(
  database: Kysely<DB>,
  params: PartyJoinParams,
): Promise<PartyJoinResult> {
  const chat = await database
    .selectFrom("chats",)
    .select(["id", "mode", "gm_config",],)
    .where("id", "=", params.chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { code: "not_found", message: "Chat not found", };
  }

  // Idempotent join: re-joining with the same role is a no-op success rather
  // than an error/duplicate-key row.
  const existing = await database
    .selectFrom("chat_participants",)
    .select(["actor_id", "role_in_chat", "talkativity",],)
    .where("chat_id", "=", params.chatId,)
    .where("actor_id", "=", params.actorId,)
    .executeTakeFirst();

  if (existing) {
    return {
      ok: true,
      participant: {
        actorId: existing.actor_id,
        role: existing.role_in_chat,
        talkativity: existing.talkativity,
      },
    };
  }

  const role = params.role ?? ChatParticipantRole.Member;
  await database
    .insertInto("chat_participants",)
    .values({
      chat_id: params.chatId,
      actor_id: params.actorId,
      role_in_chat: role,
      talkativity: 5,
    },)
    .execute();

  if (chatIsVisualNovel(chat,)) {
    await injectPartyNarration(
      database,
      params.chatId,
      `A new member has joined the party.`,
    );
  }

  return { ok: true, participant: { actorId: params.actorId, role, talkativity: 5, }, };
}

/**
 * Leave a party: remove a chat participant.
 * @param database
 * @param params
 * @returns `{ ok: true }` or a ServiceError (not_found when the chat or the
 * member does not exist).
 */
export async function leaveParty(
  database: Kysely<DB>,
  params: PartyLeaveParams,
): Promise<PartyLeaveResult> {
  const chat = await database
    .selectFrom("chats",)
    .select(["id", "mode", "gm_config",],)
    .where("id", "=", params.chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { code: "not_found", message: "Chat not found", };
  }

  const member = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", params.chatId,)
    .where("actor_id", "=", params.actorId,)
    .executeTakeFirst();

  if (!member) {
    return { code: "not_found", message: "Participant not in chat", };
  }

  await database
    .deleteFrom("chat_participants",)
    .where("chat_id", "=", params.chatId,)
    .where("actor_id", "=", params.actorId,)
    .execute();

  if (chatIsVisualNovel(chat,)) {
    await injectPartyNarration(
      database,
      params.chatId,
      `A member has left the party.`,
    );
  }

  return { ok: true, };
}
