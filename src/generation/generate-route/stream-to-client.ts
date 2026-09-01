// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * StreamToClient — streaming (SSE) generation path for
 * POST /api/generation/generate. Extracted from generate-route.ts
 * (pure refactor, no behavior change).
 *
 * BUG-generation-error-handling-gaps-detector-abort-void-promises:
 * - Abort signal is checked via `throwIfAborted()` AFTER each chunk so
 *   cancellation terminates accumulation promptly (not only at start).
 * - Telemetry `record()` and memory `extractAndStoreMemories()` void calls
 *   gain explicit `.catch(…)` so a DB outage during background tasks
 *   cannot surface as unhandled rejections.
 * - Empty final content is rejected as an explicit error.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { extractAndStoreMemories, } from "../../memory";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import { failGeneration, processStreamingChunk, } from "../cancellation-manager";
import { callWithFailover, } from "../providers/registry";
import type { ChunkEvent, GenerateRequest as ProviderRequest, LLMProvider, } from "../providers/types";
import { getOrCreateBuffer, scheduleBufferCleanup, } from "../stream-buffer";
import type { GenerationMessage, } from "../types";
import { buildGenerationResult, storeGenerationResult, } from "./persist";
import { renderToolCallBlock, sseData, } from "./sse-utils";
import { buildToolCallAssistantMessage, toGenerationToolCalls, } from "./stream-messages";
import { executeToolCalls, MAX_TOOL_ROUNDS, } from "./tool-execution";
import type { GenerateRequest, } from "./types";

/** */
export interface StreamToClientOpts {
  input: GenerateRequest;
  database: Kysely<DB>;
  messages: GenerationMessage[];
  cfg: Config;
  userId?: string;
  attemptId: string;
  modelId: string;
  providerName: string;
  providerReq: ProviderRequest;
  failoverList: { name: string; provider: LLMProvider }[];
}

/**
 * @param root0
 * @param root0.input
 * @param root0.database
 * @param root0.messages
 * @param root0.cfg
 * @param root0.userId
 * @param root0.attemptId
 * @param root0.modelId
 * @param root0.providerName
 * @param root0.providerReq
 * @param root0.failoverList
 */
export function streamToClient({
  input,
  database,
  messages,
  cfg,
  userId,
  attemptId,
  modelId,
  providerName,
  providerReq,
  failoverList,
}: StreamToClientOpts,): Response {
  let streamError: string | undefined;
  let accumulatedContent = "";
  let accumulatedThinking = "";
  let abortController: AbortController | null = null;
  const buffer = getOrCreateBuffer(input.chatId,);
  const log = getLogger().child({ module: "generate-route", },);
  const collectedToolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[] = [];

  const sseStream = new ReadableStream({
    async start(controller,) {
      try {
        abortController = new AbortController();
        const trackerSignal = providerReq.signal;
        if (trackerSignal) {
          if (trackerSignal.aborted) {
            abortController.abort(trackerSignal.reason,);
          } else {
            trackerSignal.addEventListener("abort", () => {
              abortController?.abort(trackerSignal.reason,);
            }, { once: true, },);
          }
        }
        let currentMessages = messages;
        let finalResponse: Awaited<ReturnType<typeof callWithFailover>> | null = null;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          let roundContent = "";
          let _roundThinking = "";

          const response = await callWithFailover(
            failoverList,
            { ...providerReq, messages: currentMessages, signal: abortController.signal, },
            (chunk: ChunkEvent,) => {
              if (abortController?.signal.aborted) { return; }
              if (chunk.type === "content" && chunk.content) {
                accumulatedContent += chunk.content;
                roundContent += chunk.content;
                void processStreamingChunk({ attemptId, chunk: chunk.content, db: database, },)
                  .catch((error: unknown,) => {
                    log.error("Streaming chunk detection failed", error instanceof Error ? error : undefined,);
                  },);
                controller.enqueue(
                  new TextEncoder().encode(sseData({ type: "content", content: chunk.content, },),),
                );
                buffer.append("stream-update", accumulatedContent,);
              } else if (chunk.type === "thinking" && chunk.content) {
                accumulatedThinking += chunk.content;
                _roundThinking += chunk.content;
                controller.enqueue(
                  new TextEncoder().encode(sseData({ type: "thinking", content: chunk.content, },),),
                );
              }
              // BUG-generation-error-handling-gaps: throwIfAborted AFTER
              // processing each chunk so cancellation terminates accumulation
              // promptly (not only at start).
              abortController?.signal.throwIfAborted();
            },
          );

          if (!response.toolCalls || response.toolCalls.length === 0) {
            finalResponse = response;
            break;
          }

          collectedToolCalls.push(...toGenerationToolCalls(response.toolCalls,),);
          for (const tc of response.toolCalls) {
            controller.enqueue(new TextEncoder().encode(sseData({ type: "tool_call", toolCall: tc, },),),);
            buffer.append(
              "tool_call",
              renderToolCallBlock(tc.function.name, tc.function.arguments,),
            );
          }

          currentMessages = [
            ...currentMessages,
            buildToolCallAssistantMessage(roundContent, response.toolCalls,),
          ];

          const toolResults = await executeToolCalls(response.toolCalls, {
            db: database,
            actorId: input.actorId,
            chatId: input.chatId,
          },);
          currentMessages = [...currentMessages, ...toolResults,];
        }

        if (!finalResponse) {
          throw new Error(`Tool call loop exceeded max rounds (${MAX_TOOL_ROUNDS})`,);
        }

        const result = buildGenerationResult(
          {
            ...finalResponse,
            content: finalResponse.content || accumulatedContent,
            thinking: finalResponse.thinking || accumulatedThinking || undefined,
            toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
          },
          finalResponse.finishReason === "cancelled",
          finalResponse.finishReason === "cancelled" ? CancelReason.UserCancel : undefined,
        );

        // BUG-generation-error-handling-gaps: reject empty streamed content.
        if (!result.content.trim() && finalResponse.finishReason !== "cancelled") {
          log.warn("Streamed provider returned empty content — rejecting as empty response", {
            attemptId,
            finishReason: finalResponse.finishReason,
          },);
          throw new Error(`LLM returned empty content (finishReason=${finalResponse.finishReason})`,);
        }

        const messageId = await storeGenerationResult({
          db: database,
          attemptId,
          result,
          chatId: input.chatId,
          parentMessageId: input.parentMessageId,
          actorId: input.actorId,
          modelId,
          provider: providerName,
          continuationNumber: input.continuationNumber,
        },);

        if (isTelemetryEnabled()) {
          // BUG-generation-error-handling-gaps: explicit .catch on telemetry.
          void record(database, {
            eventType: "generation.completed",
            userId,
            chatId: input.chatId,
            data: {
              promptTokens: result.tokenUsage.promptTokens,
              completionTokens: result.tokenUsage.completionTokens,
              totalTokens: result.tokenUsage.totalTokens,
              latencyMs: 0,
              model: modelId,
              provider: providerName,
              finishReason: finalResponse.finishReason,
            },
          },).catch((error: unknown,) => {
            log.error("Telemetry record failed", error instanceof Error ? error : undefined,);
          },);
        }
        // BUG-generation-error-handling-gaps: explicit .catch on memory.
        void extractAndStoreMemories(database, {
          actorId: input.actorId,
          chatId: input.chatId,
          messageId,
          aiContent: result.content,
          config: cfg,
          userId,
        },).catch((error: unknown,) => {
          log.error("Memory extraction failed", error instanceof Error ? error : undefined,);
        },);

        buffer.append("stream-update", accumulatedContent,);
        buffer.signalDone();
        scheduleBufferCleanup(input.chatId,);

        controller.enqueue(
          new TextEncoder().encode(
            sseData({
              type: "done",
              messageId,
              attemptId,
              content: result.content,
              finishReason: finalResponse.finishReason,
              tokenUsage: result.tokenUsage,
              cancelled: result.cancelled,
            },),
          ),
        );
        controller.close();
      } catch (error) {
        streamError = (error as Error).message;

        try {
          await failGeneration({ attemptId, error: error as Error, db: database, },);
        } catch {
          /* empty */
        }

        buffer.signalError(streamError,);
        scheduleBufferCleanup(input.chatId,);

        controller.enqueue(new TextEncoder().encode(sseData({ type: "error", error: streamError, },),),);
        controller.close();
      }
    },
    cancel() {
      abortController?.abort();
    },
  },);

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  },);
}