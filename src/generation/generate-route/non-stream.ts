// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RunNonStreaming — non-streaming (JSON) generation path for
 * POST /api/generation/generate. Extracted from generate-route.ts
 * (pure refactor, no behavior change).
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { extractAndStoreMemories, } from "../../memory";
import { jsonError, jsonResponse, } from "../../routes/http-utils";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import { failGeneration, } from "../cancellation-manager";
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

      // Add assistant message with tool calls
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

    const result = buildGenerationResult(
      finalResponse,
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
          latencyMs: Date.now() - startedAt,
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
    try {
      await failGeneration({ attemptId, error: error as Error, db: database, },);
    } catch {
      // failGeneration already logs errors
    }
    return jsonError({ message: `Generation failed: ${errMsg}`, status: 500, },);
  }
}
