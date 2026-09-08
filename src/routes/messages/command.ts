// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { parseCommand, } from "../../assistant/command-parser";
import type {
  CommandContext,
  CommandResult,
} from "../../assistant/commands/registry";
import { getCommand, getCommandRequirement, satisfiesRole, } from "../../assistant/commands/registry";
import {
  fillNextStep,
  formatWorkflowPreview,
} from "../../assistant/commands/workflow";
import { matchWorkflowTrigger, } from "../../assistant/workflow-routing";
import { previewSteps, } from "../../assistant/workflow-runner";
import { getSession, startSession, } from "../../assistant/workflow-session";
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
import { uid, } from "../../utils";
import { jsonResponse, } from "../http-utils";
import { log, } from "./helpers";

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
 */
export async function dispatchCommand(
  database: Kysely<DB>,
  config: Config,
  actorId: string,
  chatId: string,
  content: string,
): Promise<{ handled: true; response: Response } | { handled: false }> {
  const parsed = parseCommand(content,);
  const handler = parsed ? getCommand(parsed.command,) : undefined;
  // Registered slash commands keep existing behavior. Anything else may
  // still belong to a workflow: an active run captures plain messages as
  // step values, and trigger phrases start a new run. All other content
  // falls through to the normal message path.
  const loadedWorkflows = Object.values(config.templates?.workflows?.workflows ?? {},);
  if (!handler && !getSession(chatId,) && !matchWorkflowTrigger(content, loadedWorkflows,)) {
    return { handled: false, };
  }
  // Issue chat context, recent-message history, and participant lookup
  // concurrently — they are independent reads and used downstream only
  // after this point. (Was 3 sequential awaits: ~3× round-trip latency.)
  // `Promise.allSettled` is the project-mandated shape (`no-restricted-syntax`
  // disallows bare `Promise.all` for unhandled-rejection safety).
  const settled = await Promise.allSettled([
    database
      .selectFrom("chats",)
      .select(["id", "mode", "type", "gm_config", "world_id",],)
      .where("id", "=", chatId,)
      .executeTakeFirst(),
    database
      .selectFrom("messages",)
      .select(["id", "role", "content", "created_at",],)
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "desc",)
      .limit(50,)
      .execute(),
    // Resolve the calling participant's role for tiered command access.
    database
      .selectFrom("chat_participants",)
      .select("role_in_chat",)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst(),
  ],);
  // All settled entries are fulfilled at this point — narrow for destructuring.
  // The Promise.allSettled pattern is required by `no-restricted-syntax`;
  // we throw on any rejection so behavior matches sequential await.
  if (settled.some((r,) => r.status === "rejected")) {
    throw new Error("dispatchCommand: chat context lookup failed",);
  }
  const chatRecord = settled[0]?.status === "fulfilled" ? settled[0].value : undefined;
  const recentMessages = settled[1]?.status === "fulfilled" ? settled[1].value : [];
  const participant = settled[2]?.status === "fulfilled" ? settled[2].value : undefined;
  const roleInChat: ChatParticipantRole = participant?.role_in_chat ?? ChatParticipantRole.Member;
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
    activeChat: chatRecord
      ? {
        id: chatRecord.id,
        mode: chatRecord.mode ?? undefined,
        type: chatRecord.type ?? undefined,
        worldId: chatRecord.world_id ?? undefined,
      }
      : undefined,
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
      const msg = error instanceof Error ? error.message : String(error,);
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
        systemMessage: fillNextStep(session, content,),
        handled: true,
        action: "workflow-progress",
        actionPayload: { workflowId: session.workflow.id, },
      };
    } else {
      const match = matchWorkflowTrigger(content, loadedWorkflows,)!;
      const started = startSession(chatId, match,);
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
    const sysMsgId = uid();
    let sysStoredContent = result.systemMessage;
    const sysContentEncoding = "identity";
    let sysKeyId: string | null = null;

    if (isEncryptionEnabled()) {
      const smk = getSmk()!;
      const enc = await encryptMessageContent({
        database,
        chatId,
        actorId,
        plaintext: result.systemMessage,
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

        role: MessageRole.System as any,
        content: sysStoredContent,
        key_id: sysKeyId,

        content_format: MessageContentFormat.Markdown as any,

        content_type: MessageContentType.Text as any,
        content_encoding: sysContentEncoding as ContentEncoding,
        status: MessageStatus.Confirmed,
        visibility: "visible",
      },)
      .execute();
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
