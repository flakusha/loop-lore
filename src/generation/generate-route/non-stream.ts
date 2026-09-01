// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RunNonStreaming — non-streaming (JSON) generation path for
 * POST /api/generation/generate. Extracted from generate-route.ts
 * (pure refactor, no behavior change).
 *
 * BUG-generation-error-handling-gaps-detector-abort-void-promises:
 * - Telemetry `record()` and memory `extractAndStoreMemories()` void calls
 *   gain explicit `.catch(…)` so DB failures during these background tasks
 *   cannot surface as unhandled rejections.
 * - Empty `result.content` is rejected as an explicit error.
 *
 * Stop-and-respond interrupt (TASK-stop-and-respond-interrupt-semantics):
 * - Non-streaming responses are fully delivered before this function
 *   returns, so `deliveryConfirmed = true` is unconditionally set on
 *   the active generation and the billing/telemetry path is unchanged.
 * - On the cancellation branch (AbortError / cancelled finishReason),
 *   we mark `deliveryConfirmed = false` so any future billing query
 *   that walks the active generation's in-memory state still
 *   excludes undelivered output. (Today only stream-to-client emits
 *   telemetry, but this keeps non-stream symmetric for the rare
 *   race where the abort signal fires between response arrival and
 *   return.)
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { extractAndStoreMemories, } from "../../memory";
import { jsonError, jsonResponse, } from "../../routes/http-utils";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import { activeGenerations, failGeneration, } from "../cancellation-manager";
import { callWithFailover, } from "../providers/registry";
import type { GenerateRequest as ProviderRequest, LLMProvider, } from "../providers/types";
import type { GenerationMessage, } from "../types";
import { buildGenerationResult, storeGenerationResult, } from "./persist";
import { executeToolCalls, MAX_TOOL_ROUNDS, } from "./tool-execution";
import type { GenerateRequest, } from "./types";

/** */
export interface RunNonStreamingOpts {
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
export async function runNonStreaming({
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
}: RunNonStreamingOpts,): Promise<Response> {
  const log = getLogger().child({ module: "generate-route", },);
  try {
    const startedAt = Date.now();
    let currentMessages = messages;
    let finalResponse: Awaited<ReturnType<typeof callWithFailover>> | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await callWithFailover(failoverList, {
        ...providerReq,
        messages: currentMessages,
      },);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalResponse = response;
        break;
      }

      currentMessages = [
        ...currentMessages,
        {
          role: "assistant" as const,
          content: response.content || "",
          tool_calls: Array.from(response.toolCalls, (tc,) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments, },
          }),),
        },
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
      finalResponse,
      finalResponse.finishReason === "cancelled",
      finalResponse.finishReason === "cancelled" ? CancelReason.UserCancel : undefined,
    );

    // BUG-generation-error-handling-gaps: reject empty non-stream content.
    if (!result.content.trim() && finalResponse.finishReason !== "cancelled") {
      log.warn("Non-stream provider returned empty content — rejecting as empty response", {
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
    },);

    // Stop-and-respond: non-stream responses are fully delivered before
    // storeGenerationResult returns (no SSE transport to race). Mark
    // delivery confirmed so in-memory billing views exclude nothing.
    const active = activeGenerations.get(attemptId,);
    if (active) {
      active.deliveryConfirmed = true;
    }

    if (isTelemetryEnabled()) {
      // BUG-generation-error-handling-gaps: explicit .catch so DB outage
      // cannot become an unhandled rejection.
      void record(database, {
        eventType: "generation.completed",
        userId,
        chatId: input.chatId,
        data: {
          promptTokens: result.tokenUsage.promptTokens,
          completionTokens: result.tokenUsage.completionTokens,
          totalTokens: result.tokenUsage.totalTokens,
          latencyMs: Date.now() - startedAt,
          model: modelId,
          provider: providerName,
          finishReason: finalResponse.finishReason,
          deliveryConfirmed: true,
        },
      },).catch((error: unknown,) => {
        log.error("Telemetry record failed", error instanceof Error ? error : undefined,);
      },);
    }
    // BUG-generation-error-handling-gaps: explicit .catch on memory void.
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

    return jsonResponse({
      ok: true,
      attemptId,
      messageId,
      content: result.content,
      thinking: result.thinking,
      tokenUsage: result.tokenUsage,
      finishReason: finalResponse.finishReason,
    },);
  } catch (error) {
    const errMsg = (error as Error).message;
    // Stop-and-respond: cancelled non-stream responses mark the attempt
    // as not-delivered so any in-flight billing view excludes the token
    // usage. The persisted row goes through failGeneration which already
    // records last_rendered_chunk_index on the attempt.
    const active = activeGenerations.get(attemptId,);
    if (active) { active.deliveryConfirmed = false; }
    try {
      await failGeneration({ attemptId, error: error as Error, db: database, },);
    } catch {
      // failGeneration already logs errors
    }
    return jsonError({ message: `Generation failed: ${errMsg}`, status: 500, },);
  }
}
