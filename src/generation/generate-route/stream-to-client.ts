// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * StreamToClient — streaming (SSE) generation path for
 * POST /api/generation/generate. Extracted from generate-route.ts
 * (pure refactor, no behavior change).
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, ChunkAction, } from "../../db/enums";
import type { DB, } from "../../db/schema";
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
  // Function calls requested by the assistant across tool rounds; persisted
  // on the final message and replayed to the live stream consumer.
  const collectedToolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[] = [];

  const sseStream = new ReadableStream({
    async start(controller,) {
      try {
        abortController = new AbortController();
        let currentMessages = messages;
        let finalResponse: Awaited<ReturnType<typeof callWithFailover>> | null = null;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          let roundContent = "";
          let _roundThinking = "";

          const response = await callWithFailover(
            failoverList,
            { ...providerReq, messages: currentMessages, signal: abortController.signal, },
            (chunk: ChunkEvent,) => {
              if (chunk.type === "content" && chunk.content) {
                accumulatedContent += chunk.content;
                roundContent += chunk.content;
                // Feed chunk to repetition/policy detector
                void processStreamingChunk({ attemptId, chunk: chunk.content, db: database, },).then((action,) => {
                  if (action !== ChunkAction.Continue) {
                    // Detector triggered cancel — abort the stream
                    abortController?.abort();
                  }
                },);
                // Emit to inline SSE consumer
                controller.enqueue(
                  new TextEncoder().encode(sseData({ type: "content", content: chunk.content, },),),
                );
                // Append to buffer for SSE reconnect replay
                buffer.append("stream-update", accumulatedContent,);
              } else if (chunk.type === "thinking" && chunk.content) {
                accumulatedThinking += chunk.content;
                _roundThinking += chunk.content;
                controller.enqueue(
                  new TextEncoder().encode(sseData({ type: "thinking", content: chunk.content, },),),
                );
              }
            },
          );

          if (!response.toolCalls || response.toolCalls.length === 0) {
            finalResponse = response;
            break;
          }

          // Record tool calls for persistence (single canonical mapping)
          collectedToolCalls.push(...toGenerationToolCalls(response.toolCalls,),);
          // Emit tool_call events to client + replay to the live stream consumer
          for (const tc of response.toolCalls) {
            controller.enqueue(new TextEncoder().encode(sseData({ type: "tool_call", toolCall: tc, },),),);
            // Replay to the live stream consumer (GET /api/generation/stream/:chatId)
            buffer.append(
              "tool_call",
              renderToolCallBlock(tc.function.name, tc.function.arguments,),
            );
          }

          // Add assistant message with tool calls
          currentMessages = [
            ...currentMessages,
            buildToolCallAssistantMessage(roundContent, response.toolCalls,),
          ];

          // Execute tools and append results
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

        // Provider stream completed — handle result
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

        // Record generation telemetry event
        if (isTelemetryEnabled()) {
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
          },);
        }
        // Background: extract memories from the generated response
        void extractAndStoreMemories(database, {
          actorId: input.actorId,
          chatId: input.chatId,
          messageId,
          aiContent: result.content,
          config: cfg,
          userId,
        },);

        // Append final content to buffer for SSE reconnect replay
        buffer.append("stream-update", accumulatedContent,);
        // Signal done on StreamBuffer for GET /stream/:chatId consumers
        buffer.signalDone();
        scheduleBufferCleanup(input.chatId,);

        // Send done event to inline SSE consumer with final metadata
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

        // Fail tracking
        try {
          await failGeneration({ attemptId, error: error as Error, db: database, },);
        } catch {
          /* empty */
        }

        // Signal error on StreamBuffer for GET /stream/:chatId consumers
        buffer.signalError(streamError,);
        scheduleBufferCleanup(input.chatId,);

        controller.enqueue(new TextEncoder().encode(sseData({ type: "error", error: streamError, },),),);
        controller.close();
      }
    },
    cancel() {
      // Client disconnected — abort the provider request via controller
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
