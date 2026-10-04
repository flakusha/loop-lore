// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Route — POST /api/generation/generate — option resolution.
 *
 * Sibling of ./build-prompt (prompt assembly) and ./provider-request (provider
 * payload assembly): this one decides WHAT to generate with. The stream flag
 * and the sampling params each walk their own resolution chain, and both need a
 * chat row read that the orchestrator would otherwise carry inline.
 *
 * Extracted from handler.ts (pure refactor, no behavior change).
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { parseAssistantTuning, resolveAssistantMaxTokens, resolveAssistantTemperature, } from "../assistant-tuning";
import type { ResolvedProvider, } from "../providers/registry";
import type { GenerationMessage, GenerationOptions, } from "../types";
import type { GenerateRequest, } from "./types";

/** Inputs for {@link resolveOptions}. */
interface ResolveOpts {
  input: GenerateRequest;
  database: Kysely<DB>;
  cfg: Config;
  resolved: ResolvedProvider;
  messages: GenerationMessage[];
  systemPrompt: string | undefined;
}

/** Options plus the resolved values the handler reuses downstream. */
export interface ResolveOptionsResult {
  genOptions: GenerationOptions;
  /** Undefined when neither the request nor provider default pins a value. */
  temperature: number | undefined;
  /** Undefined when neither the request nor provider default pins a value. */
  maxTokens: number | undefined;
  resolvedStream: boolean;
}

/**
 * Resolve the stream flag and sampling params, then assemble the
 * `GenerationOptions` the tracking row and both dispatch paths are built from.
 * @returns The assembled options plus the resolved stream/temperature/maxTokens
 * @param {ResolveOpts} {
  input,
  database,
  cfg,
  resolved,
  messages,
  systemPrompt,
}
*/
export async function resolveOptions({
  input,
  database,
  cfg,
  resolved,
  messages,
  systemPrompt,
}: ResolveOpts,): Promise<ResolveOptionsResult> {
  // Resolution chain: explicit request → chat setting → config default → provider capability
  let resolvedStream = input.stream;
  if (resolvedStream === undefined) {
    // Load chat's streaming setting
    const chatRow = await database
      .selectFrom("chats",)
      .select(["streaming",],)
      .where("id", "=", input.chatId,)
      .executeTakeFirst();

    const chatStreaming = chatRow?.streaming;
    const configDefault = cfg.generation.defaultStream;
    const providerCapable = resolved.provider.capabilities.streaming;
    resolvedStream = chatStreaming === 1 ||
      (chatStreaming == null && configDefault === true) ||
      (chatStreaming == null && configDefault == null && providerCapable);
  }

  // Variant fill (smart-regen) must complete before the HTTP response so the
  // pending row is updated in place — SSE delivery cannot do that.
  if (input.targetMessageId !== undefined) { resolvedStream = false; }

  // Sampling params: explicit request → per-chat gm_config.assistantTuning →
  // provider default. The extra chat read is skipped when both are explicit.
  let tuningTemperature: number | null = null;
  let tuningMaxTokens: number | null = null;
  if (input.temperature === undefined || input.maxTokens === undefined) {
    const tuningRow = await database
      .selectFrom("chats",)
      .select(["gm_config",],)
      .where("id", "=", input.chatId,)
      .executeTakeFirst();

    const tuning = parseAssistantTuning(tuningRow?.gm_config ?? null,);
    tuningTemperature = tuning.temperature;
    tuningMaxTokens = tuning.maxTokens;
  }

  const temperature = resolveAssistantTemperature(input.temperature, tuningTemperature,);
  const maxTokens = resolveAssistantMaxTokens(input.maxTokens, tuningMaxTokens,);
  const genOptions: GenerationOptions = {
    chatId: input.chatId,
    parentMessageId: input.parentMessageId,
    actorId: input.actorId,
    modelId: resolved.resolvedModel,
    provider: resolved.resolvedProviderName,
    prompt: messages,
    temperature,
    maxTokens,
    topP: input.topP,
    systemPrompt,
    stream: resolvedStream,
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

  return { genOptions, temperature, maxTokens, resolvedStream, };
}
