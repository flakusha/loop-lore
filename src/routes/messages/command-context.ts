// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-context helpers shared by the slash-command dispatch and the GM
 * natural-language tool-execution path.
 */

import type { Kysely, } from "kysely";
import type { CommandContext, } from "../../assistant/commands/registry";
import type { Config, } from "../../config/schema";
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../../crypto";
import {
  ChatParticipantRole,
  type ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { indexMessageSearchTokens, } from "../../search";
import { resolveUserRole, } from "../../users/roles";
import { toErrorMessage, uid, } from "../../utils";

/**
 * Persist a command system message into the chat, honoring message
 * encryption when enabled. Shared by the slash-command dispatch path and
 * the GM natural-language tool-execution path.
 * @param database - Kysely instance
 * @param config - Application config
 * @param chatId - Target chat
 * @param actorId - Actor attributed with the system message
 * @param text - System message text
 * @throws {Error} When the message insert fails
 */
export async function insertCommandSystemMessage(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  text: string,
): Promise<void> {
  const sysMsgId = uid();
  let sysStoredContent = text;
  const sysContentEncoding = "identity";
  let sysKeyId: string | null = null;

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    const enc = await encryptMessageContent({
      database,
      chatId,
      actorId,
      plaintext: text,
      smk,
      pipeline: {
        threshold: config.encryption.compressThreshold,
        algorithm: config.encryption.compressAlgorithm,
      },
    },);

    sysStoredContent = enc.storedContent;
    sysKeyId = enc.keyId;
  }

  await database
    .insertInto("messages",)
    .values({
      id: sysMsgId,
      chat_id: chatId,
      actor_id: actorId,

      role: MessageRole.System,
      content: sysStoredContent,
      key_id: sysKeyId,

      content_format: MessageContentFormat.Markdown,

      content_type: MessageContentType.Text,
      content_encoding: sysContentEncoding as ContentEncoding,
      status: MessageStatus.Confirmed,
      visibility: "visible",
    },)
    .execute();

  // The row carries no plaintext mirror: index blind tokens for the token
  // tier (no-op unless ENABLE_TOKEN_INDEXING=1; fail-open).
  await indexMessageSearchTokens(database, {
    messageId: sysMsgId,
    chatId,
    plaintext: text,
    keyId: sysKeyId,
  },);
}

/** Chat row shape shared by the command-context helpers. */
export interface CommandChatRow {
  id: string;
  mode: string | null;
  type: string | null;
  gm_config: string | null;
  world_id: string | null;
}

/**
 * Build the `activeChat` field of a {@link CommandContext} from a chat row.
 * @param chatRecord - The chat row if any
 * @returns the command context's chat descriptor, or undefined when no row exists
 */
export function commandActiveChat(
  chatRecord: CommandChatRow | undefined,
): CommandContext["activeChat"] {
  if (!chatRecord) { return undefined; }
  return {
    id: chatRecord.id,
    mode: chatRecord.mode ?? undefined,
    type: chatRecord.type ?? undefined,
    worldId: chatRecord.world_id ?? undefined,
  };
}

/** The context reads every command execution path needs. */
export interface FetchedChatContext {
  chat: CommandChatRow | undefined;
  role: ChatParticipantRole;
  userRole: string | null;
  currentCharacter: CommandContext["currentCharacter"];
}

/**
 * Fetch the chat row, the actor's participant role, and the actor's site role
 * concurrently — the reads every command execution path (slash dispatch and GM
 * tool execution) needs before deciding authority. Rejections degrade to
 * undefined/null, matching the fail-open contract of the GM path. `role` is the
 * chat-participant tier (command gating); `userRole` is the `users.role` site
 * role the shared world-access helpers consume, read from the database rather
 * than from the caller so it cannot be forged.
 * @param database - Kysely instance
 * @param chatId - Target chat
 * @param actorId - Acting actor id
 * @returns the chat row, the actor's chat role, and the actor's site role
 */
export async function fetchChatAndRole(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<FetchedChatContext> {
  const settled = await Promise.allSettled([
    // Impersonation lives on the participant row: the actor the caller is
    // playing in this chat becomes the context's `currentCharacter`.
    database
      .selectFrom("chat_participants",)
      .leftJoin("actors", "actors.id", "chat_participants.impersonate_actor_id",)
      .select([
        "chat_participants.role_in_chat",
        "chat_participants.impersonate_actor_id",
        "actors.display_name as impersonate_display_name",
      ],)
      .where("chat_participants.chat_id", "=", chatId,)
      .where("chat_participants.actor_id", "=", actorId,)
      .executeTakeFirst(),
    database
      .selectFrom("chats",)
      .select(["id", "mode", "type", "gm_config", "world_id",],)
      .where("id", "=", chatId,)
      .executeTakeFirst(),
    resolveUserRole(database, actorId,),
  ],);

  const participant = settled[0]?.status === "fulfilled" ? settled[0].value : undefined;
  const chat = settled[1]?.status === "fulfilled" ? settled[1].value : undefined;
  // Fail closed: an unreadable site role stays null, which `can()` denies.
  const userRole = settled[2]?.status === "fulfilled" ? settled[2].value : null;
  // The participant's impersonated actor is the command context's
  // `currentCharacter` — commands like /inventory and /item-pickup default to it.
  const currentCharacter = participant?.impersonate_actor_id
    ? {
      id: participant.impersonate_actor_id,
      name: participant.impersonate_display_name ?? participant.impersonate_actor_id,
    }
    : undefined;

  return { chat, role: participant?.role_in_chat ?? ChatParticipantRole.Member, userRole, currentCharacter, };
}

/** The chat context plus recent history, fetched once per dispatch. */
export interface DispatchContext {
  chat: CommandChatRow | undefined;
  role: ChatParticipantRole;
  userRole: string | null;
  currentCharacter: CommandContext["currentCharacter"];
  /** Recent messages in chronological order (oldest first). */
  messages: NonNullable<CommandContext["messages"]>;
}

/**
 * Fetch the chat context and the chat's recent messages in one concurrent
 * batch. A rejected leg throws with per-leg labels: the old single blanket
 * message blamed the chat-context lookup even when the messages query was
 * the leg that failed.
 * @param database - Kysely instance
 * @param chatId - Target chat
 * @param actorId - Acting actor id
 * @returns the dispatch context (chronological message history)
 * @throws {Error} When either lookup rejects
 */
export async function fetchDispatchContext(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<DispatchContext> {
  const settled = await Promise.allSettled([
    fetchChatAndRole(database, chatId, actorId,),
    database
      .selectFrom("messages",)
      .select(["id", "role", "content", "created_at",],)
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "desc",)
      .limit(50,)
      .execute(),
  ],);

  const failures: string[] = [];
  for (const [index, outcome,] of settled.entries()) {
    if (outcome.status !== "rejected") { continue; }
    const leg = index === 0 ? "chat context lookup" : "recent messages lookup";
    failures.push(`${leg}: ${toErrorMessage(outcome.reason,)}`,);
  }

  if (failures.length > 0) {
    throw new Error(`dispatchCommand: ${failures.join("; ",)}`,);
  }

  const context = settled[0]?.status === "fulfilled"
    ? settled[0].value
    : { chat: undefined, role: ChatParticipantRole.Member, userRole: null, currentCharacter: undefined, };

  const recent = settled[1]?.status === "fulfilled" ? settled[1].value : [];

  return {
    chat: context.chat,
    role: context.role,
    userRole: context.userRole,
    currentCharacter: context.currentCharacter,
    // Stored newest-first; the command context expects chronological order.
    messages: recent.slice().reverse(),
  };
}
