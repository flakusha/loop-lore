// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Route — POST /api/generation/generate — handler orchestrator.
 *
 * Pipeline: validate → resolve provider → buildPrompt → track → build provider
 * request → dispatch to non-streaming (JSON) or streaming (SSE).
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 */

import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { jsonError, } from "../../routes/http-utils";
import { hasInFlightGeneration, IdempotencyKeyConflictError, startGenerationTracking, } from "../cancellation-manager";
import {
  buildFailoverList,
  resolveProvider,
} from "../providers/registry";
import type { ResolvedProvider, } from "../providers/registry";
import type { GenerationMessage, GenerationOptions, } from "../types";
import { buildPrompt, } from "./build-prompt";
import { runNonStreaming, } from "./non-stream";
import { streamToClient, } from "./stream-to-client";
import { gatePluginToolsByRole, } from "./tool-execution";
import type { GenerateRequest, } from "./types";

/**
 * POST /api/generation/generate
 *
 * Assembles prompt, resolves provider, calls LLM, stores message.
 *
 * @param userId  Authenticated user ID for BYO key resolution (optional).
 */
export interface HandleGenerateOpts {
  body: unknown;
  database: Kysely<DB>;
  config?: Config;
  userId?: string;
}

export async function handleGenerate({
  body,
  database,
  config: _config,
  userId,
}: HandleGenerateOpts,): Promise<Response> {
  const cfg = _config ?? loadConfig();
  const input = body as GenerateRequest;

  // ── Validate required fields ───────────────────────────
  // NOTE: `body as GenerateRequest` cast is unchecked for nested objects.
  // Sub-objects (repetitionDetection, policyDetection, responseLimit) are
  // consumed downstream — invalid values may cause runtime errors.

  if (!input.chatId || typeof input.chatId !== "string") {
    return jsonError({ message: "chatId is required", status: 400, },);
  }
  if (!input.parentMessageId || typeof input.parentMessageId !== "string") {
    return jsonError({ message: "parentMessageId is required", status: 400, },);
  }
  if (!input.actorId || typeof input.actorId !== "string") {
    return jsonError({ message: "actorId is required", status: 400, },);
  }
  if (!input.idempotencyKey || typeof input.idempotencyKey !== "string") {
    return jsonError({ message: "idempotencyKey is required", status: 400, },);
  }
  if (input.prompt !== undefined && !Array.isArray(input.prompt,)) {
    return jsonError({ message: "prompt must be an array", status: 400, },);
  }
  if (input.provider !== undefined && typeof input.provider !== "string") {
    return jsonError({ message: "provider must be a string", status: 400, },);
  }
  if (input.modelId !== undefined && typeof input.modelId !== "string") {
    return jsonError({ message: "modelId must be a string", status: 400, },);
  }

  // ── Resolve provider + model ──────────────────────────

  let resolved: ResolvedProvider;
  try {
    resolved = await resolveProvider({
      provider: input.provider,
      model: input.modelId,
      userId,
      config: cfg,
      db: database,
    },);
  } catch (error) {
    return jsonError({ message: `Provider resolution failed: ${(error as Error).message}`, status: 422, },);
  }

  // ── Assemble prompt ───────────────────────────────────

  let messages: GenerationMessage[];
  let systemPrompt: string | undefined;
  try {
    const built = await buildPrompt({
      input,
      database,
      resolvedModel: resolved.resolvedModel,
      resolvedProviderName: resolved.resolvedProviderName,
      cfg,
      userId,
    },);
    messages = built.messages;
    systemPrompt = built.systemPrompt;
  } catch (error) {
    return jsonError({ message: `Prompt assembly failed: ${(error as Error).message}`, status: 422, },);
  }

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

  // Idempotency guard (DB pre-check); the in-memory TOCTOU backstop lives in startGenerationTracking.
  if (await hasInFlightGeneration(database, input.idempotencyKey,)) {
    return jsonError({ message: "A generation with this idempotencyKey is already in flight", status: 409, },);
  }

  let attemptId: string, abortSignal: AbortSignal;
  try {
    ({ attemptId, abortSignal, } = await startGenerationTracking({ options: genOptions, db: database, },));
  } catch (err) {
    if (err instanceof IdempotencyKeyConflictError) {
      return jsonError({ message: "A generation with this idempotencyKey is already in flight", status: 409, },);
    }
    throw err;
  }

  // ── Build provider request ────────────────────────────

  // If the generating actor has a plugin agent role assigned, gate the
  // exposed plugin tools to only those the role declares. Otherwise expose
  // all registered plugin tools.
  let roleRow: { agent_role: string | null } | undefined;
  try {
    roleRow = await database
      .selectFrom("actors",)
      .select(["agent_role",],)
      .where("id", "=", input.actorId,)
      .executeTakeFirst();
  } catch {
    // Role lookup is best-effort — default to exposing all plugin tools.
  }
  const pluginTools = gatePluginToolsByRole(roleRow?.agent_role ?? null,);

  const tools = pluginTools.length > 0
    ? Array.from(pluginTools, (t,) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters, },
    }),)
    : undefined;

  const providerReq = {
    model: resolved.resolvedModel,
    messages,
    tools,
    apiKey: resolved.resolvedApiKey,
    params: {
      stream: resolvedStream,
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

  // Build failover list: primary provider first, then all others
  const failoverList = buildFailoverList(resolved.resolvedProviderName, cfg,);

  // ── Dispatch ──────────────────────────────────────────

  if (!resolvedStream) {
    return runNonStreaming({
      input,
      database,
      messages,
      cfg,
      userId,
      attemptId,
      modelId: resolved.resolvedModel,
      providerName: resolved.resolvedProviderName,
      providerReq,
      failoverList,
    },);
  }

  return streamToClient({
    input,
    database,
    messages,
    cfg,
    userId,
    attemptId,
    modelId: resolved.resolvedModel,
    providerName: resolved.resolvedProviderName,
    providerReq,
    failoverList,
  },);
}
