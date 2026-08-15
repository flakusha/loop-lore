import type { Kysely, } from "kysely";
import { generateResponse, isAssistantEnabled, } from "../../assistant/service";
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
import { isLlmGenerationConfigured, triggerAutoGeneration, } from "../../generation/auto-gen";
import { filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import { jsonCreated, } from "../http-utils";
import { log, } from "./helpers";

/**
 * Trigger post-create generation: kick off async LLM auto-generation when
 * configured, otherwise fall back to the synchronous rule-based assistant.
 * Returns a response when an assistant reply was synchronously materialized.
 */
export async function maybeAutoReply(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  parentMessageId: string,
  userMessage: string,
  request: Request,
): Promise<{ replied: boolean; response?: Response }> {
  if (isLlmGenerationConfigured(config,)) {
    void triggerAutoGeneration({
      database,
      config,
      chatId,
      parentMessageId,
      userId: actorId,
      userMessage,
      requestId: request.headers.get("x-request-id",) ?? undefined,
    },);
    return { replied: false, };
  }

  if (isAssistantEnabled(config,)) {
    const assistantResponse = generateResponse({ userInput: userMessage, },);
    if (assistantResponse) {
      const assistantId = uid();
      const assistantContent = filterProfanity(assistantResponse.content,);

      log().debug("Assistant reply (rule-based)", {
        parentId: parentMessageId,
        chatId,
        assistantId,
        contentLength: assistantContent.length,
      },);

      let replyStoredContent = assistantContent;
      const replyEncoding = "identity";
      let replyKeyId: string | null = null;

      if (isEncryptionEnabled()) {
        const smk = getSmk()!;
        const enc = await encryptMessageContent({
          database,
          chatId,
          actorId,
          plaintext: assistantContent,
          smk,
          pipeline: {
            threshold: config.encryption.compressThreshold,
            algorithm: config.encryption.compressAlgorithm,
          },
        },);
        replyStoredContent = enc.storedContent;
        replyKeyId = enc.keyId;
      }

      const replySwipe = await database
        .selectFrom("messages",)
        .select(database.fn.max("swipe_index",).as("max_idx",),)
        .where("chat_id", "=", chatId,)
        .where("parent_id", "=", parentMessageId,)
        .executeTakeFirst();
      await database
        .insertInto("messages",)
        .values({
          id: assistantId,
          chat_id: chatId,
          actor_id: actorId,
          parent_id: parentMessageId,
          role: MessageRole.Assistant,
          content: replyStoredContent,
          key_id: replyKeyId,
          content_type: MessageContentType.Text,
          content_format: MessageContentFormat.Markdown,
          content_encoding: replyEncoding as ContentEncoding,
          status: MessageStatus.Confirmed,
          visibility: "visible",
          swipe_index: (replySwipe?.max_idx ?? 0) + 1,
        },)
        .execute();

      return {
        replied: true,
        response: jsonCreated({
          id: parentMessageId,
          assistantMessage: { id: assistantId, content: assistantContent, },
        },),
      };
    }
  }

  return { replied: false, };
}
