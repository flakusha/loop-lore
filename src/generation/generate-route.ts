/**
 * Generation Route — POST /api/generation/generate
 *
 * Pipeline: validate → resolve provider → assemble prompt → track →
 *           call LLM (stream/non-stream) → store message → return.
 *
 * Streaming returns SSE (text/event-stream). Non-streaming returns JSON.
 */

import type { Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import { PromptAssembler } from "../assistant/prompt-assembler";
import { loadConfig } from "../config/load";
import type { Config } from "../config/schema";
import {
  CancelReason,
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../db/enums";
import { getDatabase } from "../db/index";
import type { DB } from "../db/schema";
import { registry } from "../plugins/registry";
import type { ToolDefinition } from "../plugins/types";
import { jsonError, jsonResponse } from "../routes/http-utils";
import { jsonParseOr, safeJsonStringify } from "../utils";
import {
  completeGeneration,
  failGeneration,
  processStreamingChunk,
  startGenerationTracking,
} from "./cancellation-manager";
import { ContextCompactor } from "./context-compactor";
import { resolveProvider } from "./providers/registry";
import type { ChunkEvent } from "./providers/types";
import type { GenerationMessage, GenerationOptions, GenerationResult } from "./types";

// ── Helpers ─────────────────────────────────────────────────

function sseData(obj: unknown): string {
  const r = safeJsonStringify(obj);
  return `data: ${r.ok ? r.value : "{\"type\":\"error\",\"error\":\"serialize failed\"}"}\n\n`;
}

interface StoreMessageOpts {
  database: Kysely<DB>;
  chatId: string;
  actorId: string;
  parentMessageId: string;
  result: GenerationResult;
  modelId: string;
  provider: string;
  continuationNumber?: number;
}

async function storeGeneratedMessage({
  database,
  chatId,
  actorId,
  parentMessageId,
  result,
  modelId,
  provider,
  continuationNumber,
}: StoreMessageOpts): Promise<string> {
  const messageId = randomUUID();
  const status = result.cancelled ? MessageStatus.Partial : MessageStatus.Confirmed;

  await database
    .insertInto("messages")
    .values({
      id: messageId,
      chat_id: chatId,
      actor_id: actorId,
      parent_id: parentMessageId,
      role: MessageRole.Assistant,
      content: result.content,
      content_type: MessageContentType.Text,
      content_format: MessageContentFormat.Markdown,
      content_encoding: ContentEncoding.Identity,
      model_id: modelId,
      provider,
      token_count_prompt: result.tokenUsage.promptTokens,
      token_count_completion: result.tokenUsage.completionTokens,
      token_count_total: result.tokenUsage.totalTokens,
      status,
      visibility: MessageVisibility.Visible,
      continuation_index: continuationNumber ?? null,
    })
    .execute();

  return messageId;
}

// ── Shared helpers ────────────────────────────────────────

/**
 * Build a GenerationResult from a provider response.
 */
function buildGenerationResult(
  response: {
    content: string;
    thinking?: string;
    toolCalls?: any[];
    finishReason: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  },
  cancelled: boolean,
  cancelReason?: CancelReason,
): GenerationResult {
  return {
    content: response.content,
    thinking: response.thinking,
    tokenUsage: {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    },
    generationTimeMs: 0,
    cancelled,
    ...(cancelReason && { cancelReason }),
  };
}

/**
 * Insert the generated message into the database and complete tracking.
 * Returns the new message ID.
 */
async function storeGenerationResult(opts: {
  db: Kysely<DB>;
  attemptId: string;
  result: GenerationResult;
  chatId: string;
  parentMessageId: string;
  actorId: string;
  modelId: string;
  provider: string;
  continuationNumber?: number;
}): Promise<string> {
  const messageId = await storeGeneratedMessage({
    database: opts.db,
    chatId: opts.chatId,
    actorId: opts.actorId,
    parentMessageId: opts.parentMessageId,
    result: opts.result,
    modelId: opts.modelId,
    provider: opts.provider,
    continuationNumber: opts.continuationNumber,
  });

  await completeGeneration({ attemptId: opts.attemptId, result: opts.result, db: opts.db });

  return messageId;
}

// ── Tool call execution ────────────────────────────────────

const MAX_TOOL_ROUNDS = 5;

interface ToolCallItem {
  id: string;
  function: { name: string; arguments: string };
}

/**
 * Execute tool calls and return tool result messages.
 * Looks up ToolDefinition from the plugin registry by name.
 */
async function executeToolCalls(toolCalls: ToolCallItem[]): Promise<GenerationMessage[]> {
  const toolDefs = registry.getAllTools();
  const results: GenerationMessage[] = [];

  for (const tc of toolCalls) {
    const def = toolDefs.find((d) => d.name === tc.function.name);
    if (!def) {
      results.push({
        role: "tool",
        content: JSON.stringify({ error: `Tool not found: ${tc.function.name}` }),
        tool_call_id: tc.id,
      });
      continue;
    }

    const params: Record<string, unknown> = jsonParseOr(tc.function.arguments, {});

    try {
      const toolResult = await def.handler(params);
      results.push({
        role: "tool",
        content: toolResult.content,
        tool_call_id: tc.id,
      });
    } catch (error) {
      results.push({
        role: "tool",
        content: JSON.stringify({ error: (error as Error).message }),
        tool_call_id: tc.id,
      });
    }
  }

  return results;
}

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
export interface HandleGenerateOpts {
  body: unknown;
  database?: Kysely<DB>;
  config?: Config;
  userId?: string;
}

export async function handleGenerate({
  body,
  database: _database,
  config: _config,
  userId,
}: HandleGenerateOpts): Promise<Response> {
  const database = _database ?? getDatabase();
  const cfg = _config ?? loadConfig();
  const input = body as GenerateRequest;

  // ── Validate required fields ───────────────────────────
  // NOTE: `body as GenerateRequest` cast on line 89 is unchecked for nested objects.
  // Sub-objects (repetitionDetection, policyDetection, responseLimit) are
  // consumed downstream — invalid values may cause runtime errors.

  if (!input.chatId || typeof input.chatId !== "string") {
    return jsonError({ message: "chatId is required", status: 400 });
  }
  if (!input.parentMessageId || typeof input.parentMessageId !== "string") {
    return jsonError({ message: "parentMessageId is required", status: 400 });
  }
  if (!input.actorId || typeof input.actorId !== "string") {
    return jsonError({ message: "actorId is required", status: 400 });
  }
  if (!input.idempotencyKey || typeof input.idempotencyKey !== "string") {
    return jsonError({ message: "idempotencyKey is required", status: 400 });
  }
  if (input.prompt !== undefined && !Array.isArray(input.prompt)) {
    return jsonError({ message: "prompt must be an array", status: 400 });
  }
  if (input.provider !== undefined && typeof input.provider !== "string") {
    return jsonError({ message: "provider must be a string", status: 400 });
  }
  if (input.modelId !== undefined && typeof input.modelId !== "string") {
    return jsonError({ message: "modelId must be a string", status: 400 });
  }

  // ── Resolve provider + model ──────────────────────────

  let resolved;
  try {
    resolved = await resolveProvider({
      provider: input.provider,
      model: input.modelId,
      userId,
      config: cfg,
      db: database,
    });
  } catch (error) {
    return jsonError({ message: `Provider resolution failed: ${(error as Error).message}`, status: 422 });
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

      if (assembled.tokenCount > assembled.tokenBudget * 0.85) {
        try {
          const compactor = new ContextCompactor({ threshold: 0.85, keepLast: 10 });
          const { messages: compacted, compacted: didCompact } = await compactor.compact(
            messages,
            assembled.tokenBudget,
          );
          if (didCompact) {
            messages = compacted;
          }
        } catch {
          /* compaction is best-effort; proceed with full context on failure */
        }
      }
    } catch (error) {
      return jsonError({ message: `Prompt assembly failed: ${(error as Error).message}`, status: 422 });
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

  const { attemptId, abortSignal } = await startGenerationTracking({ options: genOptions, db: database });

  // ── Build provider request ────────────────────────────

  const pluginTools = registry.getAllTools();
  const tools = pluginTools.length > 0
    ? pluginTools.map((t: ToolDefinition) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
    : undefined;

  const providerReq = {
    model: resolved.resolvedModel,
    messages,
    tools,
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
      let currentMessages = messages;
      let finalResponse: Awaited<ReturnType<typeof resolved.provider.complete>> | null = null;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await resolved.provider.complete({
          ...providerReq,
          messages: currentMessages,
        });

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
            tool_calls: response.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            })),
          },
        ];

        // Execute tools and append results
        const toolResults = await executeToolCalls(response.toolCalls);
        currentMessages = [...currentMessages, ...toolResults];
      }

      if (!finalResponse) {
        throw new Error(`Tool call loop exceeded max rounds (${MAX_TOOL_ROUNDS})`);
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
        modelId: resolved.resolvedModel,
        provider: resolved.resolvedProviderName,
      });

      return jsonResponse({
        ok: true,
        attemptId,
        messageId,
        content: result.content,
        thinking: result.thinking,
        tokenUsage: result.tokenUsage,
        finishReason: finalResponse.finishReason,
      });
    } catch (error) {
      const errMsg = (error as Error).message;
      try {
        await failGeneration({ attemptId, error: error as Error, db: database });
      } catch {
        // failGeneration already logs errors
      }
      return jsonError({ message: `Generation failed: ${errMsg}`, status: 500 });
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
        let currentMessages = messages;
        let finalResponse: Awaited<ReturnType<typeof resolved.provider.stream>> | null = null;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          let roundContent = "";
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          let roundThinking = "";

          const response = await resolved.provider.stream(
            { ...providerReq, messages: currentMessages, signal: abortController.signal },
            (chunk: ChunkEvent) => {
              if (chunk.type === "content" && chunk.content) {
                accumulatedContent += chunk.content;
                roundContent += chunk.content;
                void processStreamingChunk({ attemptId, chunk: chunk.content, db: database });
                controller.enqueue(
                  new TextEncoder().encode(sseData({ type: "content", content: chunk.content })),
                );
              } else if (chunk.type === "thinking" && chunk.content) {
                accumulatedThinking += chunk.content;
                roundThinking += chunk.content;
                controller.enqueue(
                  new TextEncoder().encode(sseData({ type: "thinking", content: chunk.content })),
                );
              }
            },
          );

          if (!response.toolCalls || response.toolCalls.length === 0) {
            finalResponse = response;
            break;
          }

          // Emit tool_call events to client
          for (const tc of response.toolCalls) {
            controller.enqueue(new TextEncoder().encode(sseData({ type: "tool_call", toolCall: tc })));
          }

          // Add assistant message with tool calls
          currentMessages = [
            ...currentMessages,
            {
              role: "assistant" as const,
              content: roundContent || "",
              tool_calls: response.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            },
          ];

          // Execute tools and append results
          const toolResults = await executeToolCalls(response.toolCalls);
          currentMessages = [...currentMessages, ...toolResults];
        }

        if (!finalResponse) {
          throw new Error(`Tool call loop exceeded max rounds (${MAX_TOOL_ROUNDS})`);
        }

        // Provider stream completed — handle result
        const result = buildGenerationResult(
          {
            ...finalResponse,
            content: finalResponse.content || accumulatedContent,
            thinking: finalResponse.thinking || accumulatedThinking || undefined,
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
          modelId: resolved.resolvedModel,
          provider: resolved.resolvedProviderName,
          continuationNumber: input.continuationNumber,
        });

        // Send done event with final data
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
            }),
          ),
        );
        controller.close();
      } catch (error) {
        streamError = (error as Error).message;

        // Fail tracking
        try {
          await failGeneration({ attemptId, error: error as Error, db: database });
        } catch {
          /* empty */
        }

        controller.enqueue(new TextEncoder().encode(sseData({ type: "error", error: streamError })));
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
