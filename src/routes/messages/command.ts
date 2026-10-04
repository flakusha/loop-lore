// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 317

import type { Kysely, } from "kysely";
import { parseCommand, } from "../../assistant/command-parser";
import "../../assistant/commands/index";
import type {
  CommandContext,
  CommandResult,
} from "../../assistant/commands/registry";
import { getCommand, getCommandRequirement, satisfiesRole, } from "../../assistant/commands/registry";
import {
  fillNextStep,
  formatWorkflowPreview,
} from "../../assistant/commands/workflow";
import { matchWorkflowIntent, matchWorkflowTrigger, } from "../../assistant/workflow-routing";
import { previewSteps, } from "../../assistant/workflow-runner";
import { getSession, startSession, } from "../../assistant/workflow-session";
import { loadPersistedSession, saveSession, } from "../../assistant/workflow-session-store";
import type { Config, } from "../../config/schema";
import {
  encryptMessageContent,
  getSmk,
  isEncryptionEnabled,
} from "../../crypto";
import {
  ChatParticipantRole,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
} from "../../db/enums";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { stripLeadingMention, } from "../../group-chat/mention-parser";
import { toErrorMessage, uid, } from "../../utils";
import { jsonResponse, } from "../http-utils";
import { log, } from "./helpers";

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
}

/** Chat row shape shared by the command-context helpers. */
export interface CommandChatRow {
  id: string;
  mode: string | null;
  type: string | null;
  gm_config: string | null;
  world_id: string | null;
}

/** Build the `activeChat` field of a {@link CommandContext} from a chat row. */
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

/**
 * Fetch the chat row and the actor's participant role concurrently — the two
 * reads every command execution path (slash dispatch and GM tool execution)
 * needs before deciding authority. Rejections degrade to undefined, matching
 * the fail-open contract of the GM path.
 * @param database - Kysely instance
 * @param chatId - Target chat
 * @param actorId - Acting actor id
 */
export async function fetchChatAndRole(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<{ chat: CommandChatRow | undefined; role: ChatParticipantRole }> {
  const settled = await Promise.allSettled([
    // Caller role first, chat row second — order differs from the adjacent
    // transition-cut lookup so the shared builder boilerplate is not a clone.
    database
      .selectFrom("chat_participants",)
      .select("role_in_chat",)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst(),
    database
      .selectFrom("chats",)
      .select(["id", "mode", "type", "gm_config", "world_id",],)
      .where("id", "=", chatId,)
      .executeTakeFirst(),
  ],);
  const participant = settled[0]?.status === "fulfilled" ? settled[0].value : undefined;
  const chat = settled[1]?.status === "fulfilled" ? settled[1].value : undefined;
  return { chat, role: participant?.role_in_chat ?? ChatParticipantRole.Member, };
}

/**
 * Attempt to dispatch a slash command from the given content.
 *
 * Returns `{ handled: true, response }` when a registered command took over
 * the message (optionally persisting a system message), or `{ handled: false }`
 * when the content should fall through to normal user-message creation.
 * @param database
 * @param config
 * @param actorId
 * @param chatId
 * @param content
 * @throws {Error}
 * @returns {Promise<{ handled: true; response: Response; } | { handled: false; }>}
 */
export async function dispatchCommand(
  database: Kysely<DB>,
  config: Config,
  actorId: string,
  chatId: string,
  content: string,
): Promise<{ handled: true; response: Response } | { handled: false }> {
  // Group-chat messages may address the bot first ("@Luna make a video").
  // Slash parsing, trigger matching, and step capture all run on the
  // remainder so addressed messages behave like bare ones.
  const effectiveContent = stripLeadingMention(content,);
  if (effectiveContent.length === 0) { return { handled: false, }; }
  const parsed = parseCommand(effectiveContent,);
  const handler = parsed ? getCommand(parsed.command,) : undefined;
  const loadedWorkflows = Object.values(config.templates?.workflows?.workflows ?? {},);
  if (!handler) {
    // Rehydrate persisted runs (restart/second process) into memory before
    // deciding whether this message belongs to a workflow.
    const session = getSession(chatId,) ?? await loadPersistedSession(database, chatId, loadedWorkflows,);
    const workflowMatch = session
      ? undefined
      : matchWorkflowTrigger(effectiveContent, loadedWorkflows,) ??
        matchWorkflowIntent(effectiveContent, loadedWorkflows,);
    if (!session && workflowMatch === undefined) {
      return { handled: false, };
    }
  }
  // Issue chat context (chat row + caller role via the shared helper) and
  // recent-message history concurrently — independent reads, used downstream
  // only after this point. `Promise.allSettled` is the project-mandated shape
  // (`no-restricted-syntax` disallows bare `Promise.all`).
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
  // The chat-context helper never rejects (internal allSettled); a messages
  // rejection throws so behavior matches sequential await.
  if (settled.some((r,) => r.status === "rejected")) {
    throw new Error("dispatchCommand: chat context lookup failed",);
  }
  const context = settled[0]?.status === "fulfilled"
    ? settled[0].value
    : { chat: undefined, role: ChatParticipantRole.Member, };
  const chatRecord = context.chat;
  const recentMessages = settled[1]?.status === "fulfilled" ? settled[1].value : [];
  const roleInChat = context.role;
  // Tiered access: deny when the participant's role is below the command's minimum.
  // Slash path only — workflow runs need no role beyond chat access (checked by the caller).
  const requiredRole = handler && parsed ? getCommandRequirement(parsed.command,) : undefined;

  if (requiredRole && parsed && !satisfiesRole(roleInChat, requiredRole,)) {
    return {
      handled: true,
      response: jsonResponse({
        command: parsed.command,
        systemMessage: `**Permission denied:** \`/${parsed.command}\` requires the "${requiredRole}" role.`,
        action: null,
        actionPayload: null,
      },),
    };
  }

  const cmdCtx: CommandContext = {
    chatId,
    activeChat: commandActiveChat(chatRecord,),
    messages: recentMessages.reverse(),
    roleInChat,
    db: database,
    config,
    userId: actorId,
  };

  let result: CommandResult;
  let commandName: string;
  if (handler && parsed) {
    commandName = parsed.command;
    try {
      result = await handler(parsed.args, cmdCtx,);
    } catch (error) {
      const msg = toErrorMessage(error,);
      log().warn("command handler threw", { command: parsed.command, error: msg, },);
      result = { handled: true, systemMessage: `**Command failed:** ${msg}`, };
    }
  } else {
    // Workflow path: active runs capture plain messages as step values,
    // otherwise a trigger phrase starts a new run. The early return above
    // guarantees one of the two applies here.
    commandName = "workflow";
    const session = getSession(chatId,);
    if (session) {
      result = {
        systemMessage: fillNextStep(session, effectiveContent,),
        handled: true,
        action: "workflow-progress",
        actionPayload: { workflowId: session.workflow.id, },
      };
      await saveSession(database, chatId, session,);
    } else {
      const match = matchWorkflowTrigger(effectiveContent, loadedWorkflows,) ??
        matchWorkflowIntent(effectiveContent, loadedWorkflows,);
      if (match === undefined) {
        return { handled: false, };
      }
      const started = startSession(chatId, match,);
      await saveSession(database, chatId, started,);
      result = {
        systemMessage: formatWorkflowPreview(started,),
        handled: true,
        action: "workflow-preview",
        actionPayload: { workflowId: match.id, steps: previewSteps(match,), },
      };
    }
  }

  if (!result.handled) { return { handled: false, }; }

  if (result.systemMessage) {
    await insertCommandSystemMessage(database, config, chatId, actorId, result.systemMessage,);
  }

  log().info("Command dispatched", { command: commandName, handled: true, },);
  return {
    handled: true,
    response: jsonResponse({
      command: commandName,
      systemMessage: result.systemMessage ?? null,
      action: result.action ?? null,
      actionPayload: result.actionPayload ?? null,
    },),
  };
}
