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
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../../crypto";
import { jsonParseOr } from "../../utils";
import {
  ChatParticipantRole,
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
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
 * Find the narrator actor, if one exists. Mirrors GM `injectNarration`.
 * @param database
 */
async function findNarrator(
  database: Kysely<DB>,
): Promise<{ id: string } | null> {
  const narrator = await database
    .selectFrom("actors",)
    .select("id",)
    .where("actor_type", "=", "narrator",)
    .where("agent_type", "=", "narrator",)
    .executeTakeFirst();
  return narrator ?? null;
}

/**
 * Append a VN narration message for a party event, best-effort. Mirrors the
 * GM `injectNarration` write path (encryption + narrator actor lookup). Any
 * failure is non-fatal — the party mutation has already succeeded.
 * @param database
 * @param chatId
 * @param text
 */
async function injectPartyNarration(
  database: Kysely<DB>,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    const narrator = await findNarrator(database,);
    if (!narrator) { return; }

    let storedContent = text;
    let storedKeyId: string | null = null;
    if (isEncryptionEnabled()) {
      const smk = getSmk()!;
      const enc = await encryptMessageContent({
        database,
        chatId,
        actorId: narrator.id,
        plaintext: text,
        smk,
      },);
      storedContent = enc.storedContent;
      storedKeyId = enc.keyId;
    }

    await database
      .insertInto("messages",)
      .values({
        id: crypto.randomUUID(),
        chat_id: chatId,
        actor_id: narrator.id,
        role: MessageRole.System,
        content: storedContent,
        key_id: storedKeyId,
        content_type: MessageContentType.Narration,
        content_format: MessageContentFormat.Markdown,
        content_encoding: ContentEncoding.Identity,
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
      },)
      .execute();
  } catch {
    /* non-fatal — party mutation already applied */
  }
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
    .select(["id", "gm_config"],)
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

  if (jsonParseOr<Record<string, unknown>>(chat.gm_config ?? "", {}).renderingOverride === "visual_novel") {
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
    .select(["id", "gm_config"],)
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

  if (jsonParseOr<Record<string, unknown>>(chat.gm_config ?? "", {}).renderingOverride === "visual_novel") {
    await injectPartyNarration(
      database,
      params.chatId,
      `A member has left the party.`,
    );
  }

  return { ok: true, };
}
