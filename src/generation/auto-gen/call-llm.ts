// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LLM invocation step for auto-generation.
 *
 * Classifies the user's intent (auxiliary model), resolves streaming vs
 * non-streaming, builds the failover list, and performs the call — feeding
 * streamed chunks to the repetition/policy detector and the render buffer.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ChunkAction, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { processStreamingChunk, } from "../index";
import type { ChunkEvent, } from "../providers/types";
import type { GenerationMessage, } from "../types";
import { classifyIntent, } from "./classify-intent";
import type { GenDeps, } from "./deps";
import { renderStreamMessage, } from "./stream-render";

export interface CallLlmOpts {
  d: GenDeps;
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  /** Null for initial greeting (no parent message → no render buffer). */
  parentMessageId: string | null;
  userMessage?: string;
  /** Resolved provider/request context. */
  resolved: {
    resolvedModel: string;
    resolvedProviderName: string;
    resolvedApiKey?: string;
    provider: { capabilities: { streaming: boolean } };
  };
  prompt: { messages: GenerationMessage[] };
  tracking?: { attemptId: string; abortSignal: AbortSignal };
  actorName: string;
  chatStreaming: number | null | undefined;
  /** Request ID from HTTP middleware for traceability. */
  requestId?: string;
}

export interface CallLlmResult {
  content: string;
  thinking: string | undefined;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: "stop" | "length" | "error" | "cancelled";
}

/**
 * Run the LLM request for a generated message.
 *
 * @returns The accumulated content, thinking, token usage, and finish reason.
 */
export async function callLlm(opts: CallLlmOpts,): Promise<CallLlmResult> {
  const {
    d,
    database,
    config,
    chatId,
    parentMessageId,
    userMessage,
    resolved,
    prompt,
    tracking,
    actorName,
    chatStreaming,
    requestId,
  } = opts;
  const log = getLogger().child({ module: "auto-gen", },);

  // ── Auxiliary model intent classification ────────────────────
  // Use lightweight model to classify intent and adjust generation params
  let maxTokens = 2048;
  if (userMessage) {
    const intent = await classifyIntent(userMessage, config, database,);
    if (intent?.shortReply && intent.confidence > 0.7) {
      maxTokens = 512;
      log.info("Auxiliary model: short reply detected", {
        intent: intent.intent,
        confidence: intent.confidence,
        maxTokens,
      },);
    }
  }

  let accumulatedContent = "";
  let accumulatedThinking: string | undefined;
  let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  let finishReason: "stop" | "length" | "error" | "cancelled";
  // Resolution chain: chat.streaming → config.defaultStream → provider capability
  const configDefault = config.generation.defaultStream;
  const providerCapable = resolved.provider.capabilities.streaming;
  const canStream = chatStreaming === 1 ||
    (chatStreaming == null && configDefault === true) ||
    (chatStreaming == null && configDefault == null && providerCapable);
  const buffer = parentMessageId ? d.getOrCreateBuffer(chatId,) : undefined;

  // Build failover list: primary provider first, then all others
  const failoverList = d.buildFailoverList(resolved.resolvedProviderName, config,);
  log.debug("calling LLM", { streaming: canStream, failoverCount: failoverList.length, requestId, },);
  const genReq = {
    model: resolved.resolvedModel,
    messages: prompt.messages,
    apiKey: resolved.resolvedApiKey,
    params: { temperature: 0.9, maxTokens, },
    signal: tracking?.abortSignal,
  };

  if (canStream) {
    const finalResponse = await d.callWithFailover(
      failoverList,
      genReq,
      (chunk: ChunkEvent,) => {
        if (chunk.type === "content" && chunk.content) {
          accumulatedContent += chunk.content;
          // Feed chunk to repetition/policy detector
          void processStreamingChunk({ attemptId: tracking?.attemptId ?? "", chunk: chunk.content, db: database, },)
            .then((action,) => {
              if (action !== ChunkAction.Continue) {
                // Detector triggered cancel — abort the stream
                tracking?.abortSignal?.throwIfAborted();
              }
            },);
          buffer?.append(
            "stream-update",
            renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", d.markedParse, {
              thinking: accumulatedThinking,
            },),
          );
        } else if (chunk.type === "thinking" && chunk.content) {
          accumulatedThinking = (accumulatedThinking ?? "") + chunk.content;
        }
      },
    );
    tokenUsage = {
      promptTokens: finalResponse.usage.promptTokens,
      completionTokens: finalResponse.usage.completionTokens,
      totalTokens: finalResponse.usage.totalTokens,
    };
    finishReason = finalResponse.finishReason;
  } else {
    const response = await d.callWithFailover(failoverList, genReq,);
    accumulatedContent = response.content;
    accumulatedThinking = response.thinking;
    tokenUsage = {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    };
    finishReason = response.finishReason;
    buffer?.append(
      "stream-update",
      renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", d.markedParse, {
        thinking: accumulatedThinking,
      },),
    );
  }

  log.info("LLM response", { contentLength: accumulatedContent.length, finishReason, ...tokenUsage, },);

  return { content: accumulatedContent, thinking: accumulatedThinking, tokenUsage, finishReason, };
}
