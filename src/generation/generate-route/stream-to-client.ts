// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 380

/**
 * StreamToClient — streaming (SSE) generation path for
 * POST /api/generation/generate. Pure refactor from generate-route.ts.
 *
 * Prior fixes: BUG-generation-error-handling-gaps-detector-abort-void-promises
 * (abort check after chunk, explicit .catch on async voids, empty-content
 * rejection); TASK-stop-and-respond-interrupt-semantics (lastRenderedChunkIndex
 * per enqueue, done frame with cancelled:true, telemetry gated on
 * deliveryConfirmed, client-disconnect forwards abort to side-effect jobs);
 * BUG-stream-cancel-leaves-attempt-stuck-processing-forever-no-cle (cancel →
 * streamCancelCleanup: status Cancelled + buffer done, never Failed).
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { extractAndStoreMemories, } from "../../memory";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import {
  activeGenerations,
  cancelGeneration,
  failGeneration,
  processStreamingChunk,
} from "../cancellation-manager";
import { callWithFailover, } from "../providers/registry";
import type { ChunkEvent, GenerateRequest as ProviderRequest, LLMProvider, } from "../providers/types";
import { getOrCreateBuffer, scheduleBufferCleanup, StreamBuffer, } from "../stream-buffer";
import type { GenerationMessage, } from "../types";
import { streamCancelCleanup, } from "./cancel-stream";
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
 * Flush a chunk to the SSE controller. Returns the sequence number assigned
 * by the StreamBuffer (used as `lastRenderedChunkIndex`).
 */
function flushChunk(
  controller: ReadableStreamDefaultController,
  buffer: StreamBuffer,
  chunk: string,
): number {
  const seq = buffer.append("stream-update", chunk,);
  controller.enqueue(new TextEncoder().encode(chunk,),);
  return seq;
}

/**
 * Record that this SSE event reached the client. The active generation
 * carries `lastRenderedChunkIndex` so the cancel path can persist exactly
 * where the user-visible response was truncated.
 */
function recordLastRendered(attemptId: string, seq: number,): void {
  const active = activeGenerations.get(attemptId,);
  if (active) { active.lastRenderedChunkIndex = seq; }
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
                const seq = flushChunk(controller, buffer, sseData({ type: "content", content: chunk.content, },),);
                recordLastRendered(attemptId, seq,);
              } else if (chunk.type === "thinking" && chunk.content) {
                accumulatedThinking += chunk.content;
                _roundThinking += chunk.content;
                const seq = flushChunk(controller, buffer, sseData({ type: "thinking", content: chunk.content, },),);
                recordLastRendered(attemptId, seq,);
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
            const tcFrame = sseData({ type: "tool_call", toolCall: tc, },);
            const seq = flushChunk(controller, buffer, tcFrame,);
            recordLastRendered(attemptId, seq,);
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

        const finalCancelled = finalResponse.finishReason === "cancelled";
        const result = buildGenerationResult(
          {
            ...finalResponse,
            content: finalResponse.content || accumulatedContent,
            thinking: finalResponse.thinking || accumulatedThinking || undefined,
            toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
          },
          finalCancelled,
          finalCancelled ? CancelReason.UserCancel : undefined,
        );

        // BUG-generation-error-handling-gaps: reject empty streamed content.
        if (!result.content.trim() && !finalCancelled) {
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

        // Flush "done" BEFORE telemetry: deliveryConfirmed flips only after
        // the frame is synchronously enqueued to the transport.
        const activeForDone = activeGenerations.get(attemptId,);
        const isCancelled = finalResponse.finishReason === "cancelled";
        const doneFrame = sseData({
          type: "done",
          messageId,
          attemptId,
          content: result.content,
          finishReason: finalResponse.finishReason,
          tokenUsage: result.tokenUsage,
          cancelled: isCancelled,
          lastRenderedChunkIndex: activeForDone?.lastRenderedChunkIndex ?? -1,
        },);
        const doneSeq = flushChunk(controller, buffer, doneFrame,);
        if (activeForDone) {
          activeForDone.lastRenderedChunkIndex = doneSeq;
          // Stop-and-respond: only mark deliveryConfirmed when the full
          // response (not the cancelled/truncated subset) was flushed.
          // Undelivered output leaves the flag false so billing skips it.
          activeForDone.deliveryConfirmed = !isCancelled;
        }

        if (isTelemetryEnabled() && activeForDone?.deliveryConfirmed) {
          // BUG-generation-error-handling-gaps: only generation.completed
          // when the full response was flushed; billing gates on
          // delivery_confirmed_at NOT NULL.
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
              lastRenderedChunkIndex: activeForDone.lastRenderedChunkIndex,
              deliveryConfirmed: true,
            },
          },).catch((error: unknown,) => {
            log.error("Telemetry record failed", error instanceof Error ? error : undefined,);
          },);
        } else if (isTelemetryEnabled()) {
          // Stop-and-respond: explicit analytics for truncation (no billing).
          void record(database, {
            eventType: "generation.truncated",
            userId,
            chatId: input.chatId,
            data: {
              promptTokens: result.tokenUsage.promptTokens,
              completionTokens: result.tokenUsage.completionTokens,
              totalTokens: result.tokenUsage.totalTokens,
              model: modelId,
              provider: providerName,
              finishReason: finalResponse.finishReason,
              lastRenderedChunkIndex: activeForDone?.lastRenderedChunkIndex ?? -1,
              deliveryConfirmed: false,
            },
          },).catch((error: unknown,) => {
            log.error("Telemetry truncation record failed", error instanceof Error ? error : undefined,);
          },);
        }
        // BUG-generation-error-handling-gaps: explicit .catch on memory.
        // Memory extraction runs only when the full response was delivered —
        // we don't want to memorize partial output the user never saw.
        if (activeForDone?.deliveryConfirmed) {
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
        }

        buffer.append("stream-update", accumulatedContent,);
        buffer.signalDone();
        scheduleBufferCleanup(input.chatId,);

        controller.close();
      } catch (error) {
        // Full detail goes to the attempt record and the log; the wire message
        // is generic so internal error strings (provider auth, stack text,
        // driver messages) never reach the client (BUG-sse-streams-leak...).
        log.error("Generation stream failed", error instanceof Error ? error : undefined,);
        streamError = "Generation failed";

        // BUG-stream-cancel-leaves-attempt-stuck-processing-forever-no-cle:
        // cancel/abort → status Cancelled + buffer done (never Failed/error).
        const err = error as Error;
        const isCancel = err instanceof GenerationCancelledError ||
          err.name === "AbortError" ||
          (err.cause instanceof GenerationCancelledError);
        if (isCancel) {
          await streamCancelCleanup({
            db: database,
            attemptId,
            chatId: input.chatId,
            error,
            streamError,
            accumulatedContent,
            buffer,
            controller,
          },);
          return;
        }

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
      // Client disconnect: tear down the provider call AND propagate the
      // stop-and-respond fan-out. lastRenderedChunkIndex was last updated
      // on the synchronous enqueue that handed the chunk to the transport,
      // so we record exactly what the user actually saw.
      abortController?.abort();
      const active = activeGenerations.get(attemptId,);
      if (active) {
        active.deliveryConfirmed = false;
        cancelGeneration({
          attemptId,
          reason: CancelReason.UserCancel,
          source: CancelSource.User,
          detail: "client disconnected",
        },);
      }
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
