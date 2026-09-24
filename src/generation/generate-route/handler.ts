// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Route — POST /api/generation/generate — handler orchestrator.
 *
 * Pipeline: validate → resolve provider → buildPrompt → track → build provider
 * request → dispatch to non-streaming (JSON) or streaming (SSE).
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 * Request validation + chat-access authorization live in ./validate.ts.
 */

import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { jsonError, } from "../../routes/http-utils";
import { parseAssistantTuning, resolveAssistantMaxTokens, resolveAssistantTemperature, } from "../assistant-tuning";
import { hasInFlightGeneration, IdempotencyKeyConflictError, startGenerationTracking, } from "../cancellation-manager";
import {
  buildFailoverList,
  resolveProvider,
} from "../providers/registry";
import type { ResolvedProvider, } from "../providers/registry";
import { appendStylePrompt, buildStylePrompt, } from "../smart-regen";
import type { GenerationMessage, GenerationOptions, } from "../types";
import { buildPrompt, } from "./build-prompt";
import { runNonStreaming, } from "./non-stream";
import { buildProviderRequest, } from "./provider-request";
import { streamToClient, } from "./stream-to-client";
import type { GenerateRequest, } from "./types";
import { validateGenerateRequest, } from "./validate";
/**
 * POST /api/generation/generate
 *
 * Assembles prompt, resolves provider, calls LLM, stores message.
 * @param userId  Authenticated user ID for BYO key resolution (optional).
 */
export interface HandleGenerateOpts {
  body: unknown;
  database: Kysely<DB>;
  config?: Config;
  userId?: string;
  userRole?: string | null;
}

/**
 * @param root0
 * @param root0.body
 * @param root0.database
 * @param root0.config
 * @param root0.userId
 * @param root0.userRole
 */
export async function handleGenerate({
  body,
  database,
  config: _config,
  userId,
  userRole,
}: HandleGenerateOpts,): Promise<Response> {
  const cfg = _config ?? loadConfig();
  const input = body as GenerateRequest;

  const rejected = await validateGenerateRequest({ input, database, userId, userRole, },);
  if (rejected !== null) { return rejected; }

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

  // ── Resolve group participants (manual route) ─────────────────
  // Same wiring as prepare-generation.ts: the chat_participants table is
  // joined with actors to filter out users (actor_type='user'), and the
  // generating actor itself is excluded so the actor doesn't get its own
  // card injected as a participant. The result enables the
  // `groupParticipantsSection` of the prompt assembler (which is gated on
  // `params.groupParticipantIds.length > 0`).
  const participantRows = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select("chat_participants.actor_id",)
    .where("chat_participants.chat_id", "=", input.chatId,)
    .where("actors.actor_type", "<>", "user",)
    .where("chat_participants.actor_id", "<>", input.actorId,)
    .execute();
  const groupParticipantIds = participantRows.map((row,) => row.actor_id);

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
      groupParticipantIds,
    },);
    messages = built.messages;
    systemPrompt = built.systemPrompt;
  } catch (error) {
    return jsonError({ message: `Prompt assembly failed: ${(error as Error).message}`, status: 422, },);
  }

  // Smart-regen style steering (BUG-smart-regen-style-not-threaded-through):
  // the validated style instruction is appended to the system message so the
  // LLM payload carries it — the standalone `systemPrompt` string is only
  // tracking metadata and never reaches the provider.
  const stylePrompt = buildStylePrompt(input.regenStyle ?? null,);
  if (stylePrompt !== null) {
    messages = appendStylePrompt(messages, stylePrompt,);
    systemPrompt = systemPrompt === undefined ? stylePrompt : `${systemPrompt}\n\n${stylePrompt}`;
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
  const providerReq = await buildProviderRequest({
    input: { ...input, temperature, maxTokens, },
    resolved,
    messages,
    database,
    abortSignal,
    stream: resolvedStream,
  },);

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
