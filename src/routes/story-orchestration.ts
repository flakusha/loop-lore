// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story Orchestration Routes
 *
 * Wires the story-engine surface into the HTTP API per
 * docs/frontend/chat/multi-llm-story.md § API Endpoints:
 *
 *   GET  /api/chats/:chatId/story/state      — turn state snapshot
 *   POST /api/chats/:chatId/story/pause      — pause generation
 *   POST /api/chats/:chatId/story/resume     — resume generation
 *   POST /api/chats/:chatId/story/step       — execute a single GM turn
 *   POST /api/chats/:chatId/story/configure  — strategy/maxTurns/thresholds
 *   POST /api/chats/:chatId/story/narration  — inject a narration beat
 *   POST /api/chats/:chatId/gm/escalate      — escalate the latest open turn
 */
import { Elysia, t, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { TurnStatus, } from "../db/enums-story/turns";
import { resolveProvider, } from "../generation/providers/registry";
import { resolveSystemPrompt, } from "../prompts";
import { GameMasterService, } from "../story/game-master";
import type { GenerateTextFn, } from "../story/game-master/types";
import type { GameMasterConfig, QualityThresholds, } from "../story/story-types";
import { jsonParseOr, safeJsonStringify, } from "../utils";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

/** Body accepted by POST /story/step. */
const StepBody = t.Object({ forceActorId: t.Optional(t.String(),), },);
/** Body accepted by POST /story/narration. */
const NarrationBody = t.Object({ text: t.String({ minLength: 1, },), },);
/** Body accepted by POST /story/configure. */
const ConfigureBody = t.Object({
  turnStrategy: t.Optional(t.String(),),
  maxTurns: t.Optional(t.Integer({ minimum: 1, },),),
  qualityThresholds: t.Optional(t.Record(t.String(), t.Number(),),),
},);

/** Parsed shape of the chat-level `gm_config` JSON column (story subset). */
interface ChatGmConfig {
  type?: GameMasterConfig["type"];
  llmConfig?: GameMasterConfig["llmConfig"];
  actorModels?: GameMasterConfig["actorModels"];
  humanGM?: GameMasterConfig["humanGM"];
  escalationThreshold?: number;
  qualityThresholds?: Partial<QualityThresholds>;
  assistantRole?: string;
  visualNovel?: boolean;
  storyMode?: boolean;
  gmGuidance?: unknown;
}

interface ChatRow {
  mode: string | null;
  world_id: string | null;
  gm_config: string | null;
  created_by: string;
}

/**
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param prefix
 */
export function storyOrchestrationRoutes(
  opts: { database: Db; config: Config },
  prefix = "/api",
): Elysia {
  const db = opts.database;

  return (
    new Elysia({ name: "story-orchestration", prefix, },)
      .get(
        "/chats/:chatId/story/state",
        async ({ params, }: { params: { chatId: string } }) => {
          const chat = await loadChat(db, params.chatId,);
          if (!chat) { return notFound(); }
          const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
          await gm.initialize();
          return jsonResponse({
            chatId: params.chatId,
            currentTurn: gm.currentTurn,
            isPaused: gm.isPaused,
            isComplete: gm.isComplete,
          },);
        },
      )
      .post(
        "/chats/:chatId/story/pause",
        async ({ params, }: { params: { chatId: string } }) => {
          const chat = await loadChat(db, params.chatId,);
          if (!chat) { return notFound(); }
          const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
          await gm.initialize();
          await gm.pause();
          return jsonResponse({ ok: true, isPaused: true, },);
        },
      )
      .post(
        "/chats/:chatId/story/resume",
        async ({ params, }: { params: { chatId: string } }) => {
          const chat = await loadChat(db, params.chatId,);
          if (!chat) { return notFound(); }
          const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
          await gm.initialize();
          await gm.resume();
          return jsonResponse({ ok: true, isPaused: false, },);
        },
      )
      .post(
        "/chats/:chatId/story/step",
        async ({ params, body, }: { params: { chatId: string }; body: { forceActorId?: string } }) => {
          const chat = await loadChat(db, params.chatId,);
          if (!chat) { return notFound(); }
          const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
          await gm.initialize();
          const result = await gm.executeTurn(body.forceActorId,);
          return jsonResponse({
            turnId: result.turnId,
            actorId: result.actorId ?? null,
            decision: result.decision,
            response: result.response ?? null,
          },);
        },
        { body: StepBody, },
      )
      .post(
        "/chats/:chatId/story/configure",
        async ({ params, body, }: { params: { chatId: string }; body: { turnStrategy?: string; maxTurns?: number; qualityThresholds?: Record<string, number> } }) => {
          const chat = await loadChat(db, params.chatId,);
          if (!chat) { return notFound(); }
          const merged = jsonParseOr<ChatGmConfig>(chat.gm_config ?? "{}", {},);
          if (body.qualityThresholds) {
            merged.qualityThresholds = { ...merged.qualityThresholds, ...body.qualityThresholds, };
          }
          const serialized = safeJsonStringify(merged,);
          if (!serialized.ok) {
            return jsonError({ message: "gm_config serialization failed", status: HttpStatus.InternalServerError, },);
          }
          await db
            .updateTable("chats",)
            .set({
              turn_strategy: body.turnStrategy ?? null,
              max_turns: body.maxTurns ?? null,
              gm_config: serialized.value,
              updated_at: new Date().toISOString(),
            },)
            .where("id", "=", params.chatId,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        { body: ConfigureBody, },
      )
      .post(
        "/chats/:chatId/story/narration",
        async ({ params, body, }: { params: { chatId: string }; body: { text: string } }) => {
          const chat = await loadChat(db, params.chatId,);
          if (!chat) { return notFound(); }
          if (!chat.world_id) {
            return jsonError({ message: "Chat has no world — narration requires a world context", status: HttpStatus.BadRequest, },);
          }
          const gm = createGm(db, opts.config, params.chatId, chat.gm_config, chat.created_by,);
          await gm.initialize();
          await gm.injectNarration(chat.world_id, body.text,);
          return jsonResponse({ ok: true, },);
        },
        { body: NarrationBody, },
      )
      .post(
        "/chats/:chatId/gm/escalate",
        async ({ params, }: { params: { chatId: string } }) => {
          const chat = await loadChat(db, params.chatId,);
          if (!chat) { return notFound(); }
          const turn = await latestOpenTurn(db, params.chatId,);
          if (!turn) {
            return jsonError({ message: "No open story turn to escalate", status: HttpStatus.NotFound, },);
          }
          await db
            .updateTable("story_turns",)
            .set({ status: TurnStatus.Escalated, updated_at: new Date().toISOString(), },)
            .where("id", "=", turn.id,)
            .execute();
          return jsonResponse({ ok: true, turnId: turn.id, status: TurnStatus.Escalated, },);
        },
      ),
  );
}

function notFound(): Response {
  return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
}

async function loadChat(db: Db, chatId: string,): Promise<ChatRow | null> {
  return await db
    .selectFrom("chats",)
    .select(["mode", "world_id", "gm_config", "created_by",],)
    .where("id", "=", chatId,)
    .executeTakeFirst() ?? null;
}

/** Terminal statuses — an open turn is anything else. */
const TURN_TERMINAL_STATUSES: readonly string[] = ["accepted", "escalated",];

async function latestOpenTurn(db: Db, chatId: string,): Promise<{ id: string; status: string } | null> {
  const rows = await db
    .selectFrom("story_turns",)
    .select(["id", "status",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(1,)
    .execute();
  const latest = rows[0];
  if (!latest || TURN_TERMINAL_STATUSES.includes(latest.status,)) { return null; }
  return latest;
}

/** Parse the chat's gm_config JSON into the story-domain config subset. */
function parseGmConfig(raw: string | null,): ChatGmConfig {
  return jsonParseOr<ChatGmConfig>(raw ?? "{}", {},);
}

function createGm(
  db: Db,
  config: Config,
  chatId: string,
  gmConfigRaw: string | null,
  userId: string,
): GameMasterService {
  const parsed = parseGmConfig(gmConfigRaw,);
  const gameMasterConfig: GameMasterConfig = {
    type: parsed.type ?? "llm",
    ...(parsed.llmConfig ? { llmConfig: parsed.llmConfig, } : {}),
    ...(parsed.actorModels ? { actorModels: parsed.actorModels, } : {}),
    ...(parsed.humanGM ? { humanGM: parsed.humanGM, } : {}),
    ...(typeof parsed.escalationThreshold === "number"
      ? { escalationThreshold: parsed.escalationThreshold, }
      : {}),
  };
  const generateText: GenerateTextFn = async (params,) => {
    const resolved = await resolveProvider({
      userId,
      config,
      provider: params.provider || undefined,
      model: params.model || undefined,
    },);
    const response = await resolved.provider.complete({
      model: resolved.resolvedModel,
      messages: params.messages,
      apiKey: resolved.resolvedApiKey,
      params: { temperature: params.temperature ?? 0.9, maxTokens: params.maxTokens ?? 2048, },
    },);
    return response.content;
  };
  return new GameMasterService({
    db,
    chatId,
    gmConfig: gameMasterConfig,
    qualityThresholds: parsed.qualityThresholds,
    generateText,
    systemPromptDefault: resolveSystemPrompt(config.templates.llm, "gm",),
    appConfig: config,
  },);
}
