import type { Kysely, } from "kysely";
import { parseCommand, } from "../../assistant/command-parser";
import { type CommandContext, getCommand, } from "../../assistant/commands/registry";
import type { Config, } from "../../config/schema";
import {
  encryptMessageContent,
  getSmk,
  isEncryptionEnabled,
} from "../../crypto";
import {
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
 */
export async function dispatchCommand(
  database: Kysely<DB>,
  config: Config,
  actorId: string,
  chatId: string,
  content: string,
): Promise<{ handled: true; response: Response } | { handled: false }> {
  const parsed = parseCommand(content,);
  if (!parsed) { return { handled: false, }; }
  const handler = getCommand(parsed.command,);
  if (!handler) { return { handled: false, }; }

  const chatRecord = await database
    .selectFrom("chats",)
    .select(["id", "mode", "type", "gm_config", "world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const recentMessages = await database
    .selectFrom("messages",)
    .select(["id", "role", "content", "created_at",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(50,)
    .execute();

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
    db: database,
    config,
    userId: actorId,
  };

  const result = await handler(parsed.args, cmdCtx,);

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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Kysely enum type mismatch
        role: MessageRole.System as any,
        content: sysStoredContent,
        key_id: sysKeyId,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Kysely enum type mismatch
        content_format: MessageContentFormat.Markdown as any,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- Kysely enum type mismatch
        content_type: MessageContentType.Text as any,
        content_encoding: sysContentEncoding as ContentEncoding,
        status: MessageStatus.Confirmed,
        visibility: "visible",
      },)
      .execute();
  }

  log().info("Command dispatched", { command: parsed.command, handled: true, },);
  return {
    handled: true,
    response: jsonResponse({
      command: parsed.command,
      systemMessage: result.systemMessage ?? null,
      action: result.action ?? null,
      actionPayload: result.actionPayload ?? null,
    },),
  };
}
