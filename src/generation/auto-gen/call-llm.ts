// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * LLM invocation step for auto-generation.
 *
 * Classifies the user's intent (auxiliary model), resolves streaming vs
 * non-streaming, builds the failover list, and performs the call — feeding
 * streamed chunks to the repetition/policy detector and the render buffer.
 *
 * BUG-generation-error-handling-gaps-detector-abort-void-promises:
 * - Detector also feeds the non-streaming path (was previously skipped).
 * - Abort is checked AFTER each chunk via `throwIfAborted`, making
 *   cancellation effective mid-stream (not only at start).
 * - Empty content is rejected as an error instead of returning "".
 *
 * Stop-and-respond interrupt (TASK-stop-and-respond-interrupt-semantics):
 * - The provider AbortSignal is wired through from the active generation
 *   tracker (already on dev) so user-initiated Stop unblocks the provider
 *   stream synchronously.
 * - On abort the call returns the partial text already accumulated, which
 *   is exactly what the SSE path flushed before the abort fired — this
 *   keeps the auto-gen path symmetric with the manual generate route.
 * - `lastRenderedChunkIndex` is updated on each successful buffer append
 *   so the cancel path can persist the truncation point the user saw.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { activeGenerations, processStreamingChunk, } from "../cancellation-manager";
import type { ChunkEvent, } from "../providers/types";
import type { GenerationMessage, } from "../types";
import { classifyIntent, } from "./classify-intent";
import type { GenDeps, } from "./deps";
import { renderStreamMessage, } from "./stream-render";

/** */
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

/** */
export interface CallLlmResult {
  content: string;
  thinking: string | undefined;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: "stop" | "length" | "error" | "cancelled";
}

/**
 * Update lastRenderedChunkIndex on the active generation record. No-op
 * when the attempt is no longer in flight (e.g. it completed while we
 * were still flushing chunks). The buffer's append() returns the
 * sequence number the cancel path uses as the truncation marker.
 */
function bumpLastRendered(attemptId: string | undefined, seq: number,): void {
  if (!attemptId) { return; }
  const active = activeGenerations.get(attemptId,);
  if (active) { active.lastRenderedChunkIndex = seq; }
}

/**
 * Run the LLM call for a generated message.
 * @param opts
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
  const configDefault = config.generation.defaultStream;
  const providerCapable = resolved.provider.capabilities.streaming;
  const canStream = chatStreaming === 1 ||
    (chatStreaming == null && configDefault === true) ||
    (chatStreaming == null && configDefault == null && providerCapable);
  const buffer = parentMessageId ? d.getOrCreateBuffer(chatId,) : undefined;

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
    if (!tracking) {
      log.warn("Streaming without generation tracking — repetition/policy detection disabled", {
        chatId,
        requestId,
      },);
    }
    const finalResponse = await d.callWithFailover(
      failoverList,
      genReq,
      (chunk: ChunkEvent,) => {
        if (tracking?.abortSignal.aborted) { return; }
        if (chunk.type === "content" && chunk.content) {
          accumulatedContent += chunk.content;
          if (tracking) {
            void processStreamingChunk({ attemptId: tracking.attemptId, chunk: chunk.content, db: database, },)
              .catch((error: unknown,) => {
                log.error("Streaming chunk detection failed", error instanceof Error ? error : undefined,);
              },);
          }
          if (buffer) {
            const seq = buffer.append(
              "stream-update",
              renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", d.markedParse, {
                thinking: accumulatedThinking,
              },),
            );
            bumpLastRendered(tracking?.attemptId, seq,);
          }
        } else if (chunk.type === "thinking" && chunk.content) {
          accumulatedThinking = (accumulatedThinking ?? "") + chunk.content;
        }
        // BUG-generation-error-handling-gaps: throwIfAborted AFTER processing
        // each chunk so cancellation terminates accumulation promptly.
        tracking?.abortSignal.throwIfAborted();
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
    // BUG-generation-error-handling-gaps: detector also fed on non-stream.
    if (tracking && response.content) {
      void processStreamingChunk({ attemptId: tracking.attemptId, chunk: response.content, db: database, },)
        .catch((error: unknown,) => {
          log.error("Non-stream response detection failed", error instanceof Error ? error : undefined,);
        },);
    }
    accumulatedContent = response.content;
    accumulatedThinking = response.thinking;
    tokenUsage = {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    };
    finishReason = response.finishReason;
    if (buffer) {
      const seq = buffer.append(
        "stream-update",
        renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", d.markedParse, {
          thinking: accumulatedThinking,
        },),
      );
      bumpLastRendered(tracking?.attemptId, seq,);
    }
  }

  log.info("LLM response", { contentLength: accumulatedContent.length, finishReason, ...tokenUsage, },);

  // BUG-generation-error-handling-gaps: reject empty content (cancellations
  // are allowed to return empty so retry paths can short-circuit).
  if (!accumulatedContent.trim() && finishReason !== "cancelled") {
    log.warn("LLM produced empty content — rejecting as empty response", { finishReason, tokenUsage, requestId, },);
    throw new Error(`LLM returned empty content (finishReason=${finishReason})`,);
  }

  return { content: accumulatedContent, thinking: accumulatedThinking, tokenUsage, finishReason, };
}
