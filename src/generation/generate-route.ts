/**
 * Generation Route — POST /api/generation/generate
 *
 * Pipeline: validate → resolve provider → assemble prompt → track →
 *           call LLM (stream/non-stream) → store message → return.
 *
 * Streaming returns SSE (text/event-stream). Non-streaming returns JSON.
 */

import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { getDatabase } from "../db/index";
import {
  MessageRole,
  MessageContentType,
  ContentEncoding,
  MessageStatus,
  MessageVisibility,
} from "../db/enums";
import {
  startGenerationTracking,
  completeGeneration,
  failGeneration,
  processStreamingChunk,
} from "./cancellation-manager";
import type { GenerationOptions, GenerationMessage, GenerationResult } from "./types";
import type { ChunkEvent } from "./providers/types";
import { resolveProvider } from "./providers/registry";
import { PromptAssembler } from "../assistant/prompt-assembler";
import type { Config } from "../config/schema";
import { loadConfig } from "../config/load";
import { jsonResponse, jsonError } from "../routes/http-utils";

// ── Request shape ─────────────────────────────────────────

export interface GenerateRequest {
  /** Chat to generate for */
  chatId: string;
  /** Parent message ID (user message being responded to) */
  parentMessageId: string;
  /** Actor generating the response */
  actorId: string;
  /** Model override (uses config default if absent) */
  modelId?: string;
  /** Provider override (uses config default if absent) */
  provider?: string;
  /** Explicit prompt messages (uses prompt assembler if absent) */
  prompt?: GenerationMessage[];
  /** System prompt override */
  systemPrompt?: string;
  /** Generation params */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Stream response (default: false) */
  stream?: boolean;
  /** Idempotency key for dedup */
  idempotencyKey: string;
  /** Repetition detection config */
  repetitionDetection: GenerationOptions["repetitionDetection"];
  /** Policy detection config */
  policyDetection: GenerationOptions["policyDetection"];
  /** Response limit config */
  responseLimit: GenerationOptions["responseLimit"];
  /** Continuation metadata */
  parentAttemptId?: string;
  continuationNumber?: number;
  partialContent?: string;
  stepIndex?: number;
  totalSteps?: number;
  /** llama.cpp extended params (passthrough) */
  minP?: number;
  topK?: number;
  typicalP?: number;
  repeatPenalty?: number;
  dryMultiplier?: number;
  xtcProbability?: number;
  dynatempRange?: number;
  reasoningBudget?: number;
  stop?: string[];
}

// ── Handler ───────────────────────────────────────────────

/**
 * POST /api/generation/generate
 *
 * Assembles prompt, resolves provider, calls LLM, stores message.
 *
 * @param userId  Authenticated user ID for BYO key resolution (optional).
 */
export async function handleGenerate(
  body: unknown,
  _database?: Kysely<DB>,
  config?: Config,
  userId?: string,
): Promise<Response> {
  const database = _database ?? getDatabase();
  const cfg = config ?? loadConfig();
  const input = body as GenerateRequest;

  // ── Validate required fields ───────────────────────────
  // NOTE: `body as GenerateRequest` cast on line 89 is unchecked for nested objects.
  // Sub-objects (repetitionDetection, policyDetection, responseLimit) are
  // consumed downstream — invalid values may cause runtime errors.

  if (!input.chatId || typeof input.chatId !== "string") return jsonError("chatId is required", 400);
  if (!input.parentMessageId || typeof input.parentMessageId !== "string")
    return jsonError("parentMessageId is required", 400);
  if (!input.actorId || typeof input.actorId !== "string") return jsonError("actorId is required", 400);
  if (!input.idempotencyKey || typeof input.idempotencyKey !== "string")
    return jsonError("idempotencyKey is required", 400);
  if (input.prompt !== undefined && !Array.isArray(input.prompt))
    return jsonError("prompt must be an array", 400);
  if (input.provider !== undefined && typeof input.provider !== "string")
    return jsonError("provider must be a string", 400);
  if (input.modelId !== undefined && typeof input.modelId !== "string")
    return jsonError("modelId must be a string", 400);

  // ── Resolve provider + model ──────────────────────────

  let resolved;
  try {
    resolved = await resolveProvider(
      { provider: input.provider, model: input.modelId, userId },
      cfg,
      database,
    );
  } catch (error) {
    return jsonError(`Provider resolution failed: ${(error as Error).message}`, 422);
  }

  // ── Assemble prompt ───────────────────────────────────

  let messages: GenerationMessage[];
  let systemPrompt: string | undefined;

  if (input.prompt && input.prompt.length > 0) {
    messages = input.prompt;
    systemPrompt = input.systemPrompt;
  } else {
    try {
      const assembler = new PromptAssembler(database);
      const assembled = await assembler.assemble({
        actorId: input.actorId,
        chatId: input.chatId,
        modelId: resolved.resolvedModel,
        systemPromptOverride: input.systemPrompt,
      });
      messages = assembled.messages;
      systemPrompt = assembled.systemPrompt;
    } catch (error) {
      return jsonError(`Prompt assembly failed: ${(error as Error).message}`, 422);
    }
  }

  // ── Build generation options for tracking ─────────────

  const genOptions: GenerationOptions = {
    chatId: input.chatId,
    parentMessageId: input.parentMessageId,
    actorId: input.actorId,
    modelId: resolved.resolvedModel,
    provider: resolved.resolvedProviderName,
    prompt: messages,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    topP: input.topP,
    systemPrompt,
    stream: input.stream ?? false,
    idempotencyKey: input.idempotencyKey,
    repetitionDetection: input.repetitionDetection,
    policyDetection: input.policyDetection,
    responseLimit: input.responseLimit,
    parentAttemptId: input.parentAttemptId,
    continuationNumber: input.continuationNumber,
    partialContent: input.partialContent,
    stepIndex: input.stepIndex,
    totalSteps: input.totalSteps,
  };

  // ── Track generation attempt ─────────────────────────

  const { attemptId, abortSignal } = startGenerationTracking(genOptions, database);

  // ── Build provider request ────────────────────────────

  const providerReq = {
    model: resolved.resolvedModel,
    messages,
    apiKey: resolved.resolvedApiKey,
    params: {
      stream: input.stream ?? false,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      topP: input.topP,
      stop: input.stop,
      minP: input.minP,
      topK: input.topK,
      typicalP: input.typicalP,
      repeatPenalty: input.repeatPenalty,
      dryMultiplier: input.dryMultiplier,
      xtcProbability: input.xtcProbability,
      dynatempRange: input.dynatempRange,
      reasoningBudget: input.reasoningBudget,
    },
    signal: abortSignal,
  };

  // ── Non-streaming path ─────────────────────────────────

  if (!input.stream) {
    try {
      const response = await resolved.provider.complete(providerReq);

      const result: GenerationResult = {
        content: response.content,
        thinking: response.thinking,
        tokenUsage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        },
        generationTimeMs: 0, // set by completeGeneration
        cancelled: response.finishReason === "cancelled",
        cancelReason: response.finishReason === "cancelled" ? "user_cancel" : undefined,
      };

      // Store message
      const messageId = randomUUID();
      await database
        .insertInto("messages")
        .values({
          id: messageId,
          chat_id: input.chatId,
          actor_id: input.actorId,
          parent_id: input.parentMessageId,
          role: MessageRole.Assistant,
          content: result.content,
          content_type: MessageContentType.Text,
          content_encoding: ContentEncoding.Identity,
          model_id: resolved.resolvedModel,
          provider: resolved.resolvedProviderName,
          token_count_prompt: result.tokenUsage.promptTokens,
          token_count_completion: result.tokenUsage.completionTokens,
          token_count_total: result.tokenUsage.totalTokens,
          status: MessageStatus.Confirmed,
          visibility: MessageVisibility.Visible,
        })
        .execute();

      // Complete tracking
      await completeGeneration(attemptId, result, database);

      return jsonResponse({
        ok: true,
        attemptId,
        messageId,
        content: result.content,
        thinking: result.thinking,
        tokenUsage: result.tokenUsage,
        finishReason: response.finishReason,
      });
    } catch (error) {
      const errMsg = (error as Error).message;
      await failGeneration(attemptId, error as Error, database).catch(() => {});
      return jsonError(`Generation failed: ${errMsg}`, 500);
    }
  }

  // ── Streaming (SSE) path ─────────────────────────────

  let streamError: string | undefined;
  let accumulatedContent = "";
  let accumulatedThinking = "";
  let abortController: AbortController | null = null;

  const sseStream = new ReadableStream({
    async start(controller) {
      try {
        abortController = new AbortController();
        const finalResponse = await resolved.provider.stream(providerReq, async (chunk: ChunkEvent) => {
          if (chunk.type === "content" && chunk.content) {
            accumulatedContent += chunk.content;
            // Fire-and-forget cancellation detection
            try {
              await processStreamingChunk(attemptId, chunk.content, database);
            } catch {
              /* empty */
            }
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "content", content: chunk.content })}\n\n`,
              ),
            );
          } else if (chunk.type === "thinking" && chunk.content) {
            accumulatedThinking += chunk.content;
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "thinking", content: chunk.content })}\n\n`,
              ),
            );
          } else if (chunk.type === "done" && chunk.usage) {
            // usage captured from finalResponse
          }
        });

        // Provider stream completed — handle result
        // Use accumulated content as fallback if provider didn't return full content
        const result: GenerationResult = {
          content: finalResponse.content || accumulatedContent,
          thinking: finalResponse.thinking || accumulatedThinking || undefined,
          tokenUsage: {
            promptTokens: finalResponse.usage.promptTokens,
            completionTokens: finalResponse.usage.completionTokens,
            totalTokens: finalResponse.usage.totalTokens,
          },
          generationTimeMs: 0,
          cancelled: finalResponse.finishReason === "cancelled",
        };

        if (result.cancelled) {
          result.cancelReason = "user_cancel";
        }

        // Store message
        const messageId = randomUUID();
        await database
          .insertInto("messages")
          .values({
            id: messageId,
            chat_id: input.chatId,
            actor_id: input.actorId,
            parent_id: input.parentMessageId,
            role: MessageRole.Assistant,
            content: result.content,
            content_type: MessageContentType.Text,
            content_encoding: ContentEncoding.Identity,
            model_id: resolved.resolvedModel,
            provider: resolved.resolvedProviderName,
            token_count_prompt: result.tokenUsage.promptTokens,
            token_count_completion: result.tokenUsage.completionTokens,
            token_count_total: result.tokenUsage.totalTokens,
            status: result.cancelled ? MessageStatus.Partial : MessageStatus.Confirmed,
            visibility: MessageVisibility.Visible,
            continuation_index: input.continuationNumber ?? null,
          })
          .execute();

        // Complete tracking
        await completeGeneration(attemptId, result, database);

        // Send done event with final data
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: "done",
              messageId,
              attemptId,
              content: result.content,
              finishReason: finalResponse.finishReason,
              tokenUsage: result.tokenUsage,
              cancelled: result.cancelled,
            })}\n\n`,
          ),
        );
        controller.close();
      } catch (error) {
        streamError = (error as Error).message;

        // Fail tracking
        try {
          await failGeneration(attemptId, error as Error, database);
        } catch {
          /* empty */
        }

        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", error: streamError })}\n\n`),
        );
        controller.close();
      }
    },
    cancel() {
      // Client disconnected — abort the provider request via controller
      abortController?.abort();
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
