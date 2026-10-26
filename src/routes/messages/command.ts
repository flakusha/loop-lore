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
import { resolveUserRole, } from "../../users/roles";
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

/**
 * Build the `activeChat` field of a {@link CommandContext} from a chat row.
 * @param chatRecord
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
): Promise<{
  chat: CommandChatRow | undefined;
  role: ChatParticipantRole;
  userRole: string | null;
  currentCharacter: CommandContext["currentCharacter"];
}> {
  const settled = await Promise.allSettled([
    // Caller role first, chat row second — order differs from the adjacent
    // transition-cut lookup so the shared builder boilerplate is not a clone.
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

/**
 * Describe the rejected legs of the dispatch lookups.
 *
 * `dispatchCommand` issues the chat-context and recent-messages reads as one
 * `allSettled` batch, so a blanket error message blamed the chat-context
 * lookup even when the messages query was the leg that failed.
 * @param settled - Settled results, chat context first
 * @returns One `"<leg>: <reason>"` string per rejected leg (empty when all fulfilled)
 */
function describeLookupFailures(settled: PromiseSettledResult<unknown>[],): string[] {
  const failures: string[] = [];
  for (const [index, outcome,] of settled.entries()) {
    if (outcome.status !== "rejected") { continue; }
    const leg = index === 0 ? "chat context lookup" : "recent messages lookup";
    failures.push(`${leg}: ${toErrorMessage(outcome.reason,)}`,);
  }

  return failures;
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
 * @throws {Error} When the chat-context or recent-messages lookup rejects
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
  // rejection throws so behavior matches sequential await. Failures are
  // labelled per leg: a single blanket message blamed the chat-context lookup
  // even when the messages query was the leg that failed.
  const failures = describeLookupFailures(settled,);
  if (failures.length > 0) {
    throw new Error(`dispatchCommand: ${failures.join("; ",)}`,);
  }

  const context = settled[0]?.status === "fulfilled"
    ? settled[0].value
    : { chat: undefined, role: ChatParticipantRole.Member, userRole: null, currentCharacter: undefined, };

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
    userRole: context.userRole,
    currentCharacter: context.currentCharacter,
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
    // The handler already ran its side effects; a failed system-message insert
    // must not surface as an unhandled 500 that hides the completed command.
    try {
      await insertCommandSystemMessage(database, config, chatId, actorId, result.systemMessage,);
    } catch (error) {
      log().warn("command system message insert failed", {
        command: commandName,
        error: toErrorMessage(error,),
      },);
    }
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
