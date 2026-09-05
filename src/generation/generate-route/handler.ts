// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 279

/**
 * Generation Route — POST /api/generation/generate — handler orchestrator.
 *
 * Pipeline: validate → resolve provider → buildPrompt → track → build provider
 * request → dispatch to non-streaming (JSON) or streaming (SSE).
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 */

import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { forbiddenResponse, jsonError, requireUserId, } from "../../routes/http-utils";
import { hasInFlightGeneration, IdempotencyKeyConflictError, startGenerationTracking, } from "../cancellation-manager";
import {
  buildFailoverList,
  resolveProvider,
} from "../providers/registry";
import type { ResolvedProvider, } from "../providers/registry";
import type { GenerationMessage, GenerationOptions, } from "../types";
import { buildPrompt, } from "./build-prompt";
import { runNonStreaming, } from "./non-stream";
import { buildProviderRequest, } from "./provider-request";
import { streamToClient, } from "./stream-to-client";
import type { GenerateRequest, } from "./types";

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

  // ── Authorization: chat access ─────────────────────────
  // Cross-user write guard: only admin, creator, or a participant of
  // `chatId` may trigger generation (BUG-generation-control-plane-routes-lack-authorization).
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }
  const access = await checkChatAccess(database, input.chatId, authUserId, userRole,);
  if (!access.ok) { return forbiddenResponse(); }
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
  const providerReq = await buildProviderRequest({
    input,
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
