// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story Orchestration — chat + GameMasterService plumbing
 *
 * Loads the chat row, parses the chat-level `gm_config` JSON into the
 * story-domain config subset, and builds a `GameMasterService` wired to the
 * provider registry. Shared by the story-orchestration route handlers.
 */
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";
import { resolveProvider, } from "../../generation/providers/registry";
import { resolveSystemPrompt, } from "../../prompts";
import { GameMasterService, } from "../../story/game-master";
import type { GenerateTextFn, } from "../../story/game-master/types";
import type { GameMasterConfig, QualityThresholds, } from "../../story/story-types";
import { jsonParseOr, } from "../../utils";
import { HttpStatus, jsonError, } from "../http-utils";

/** Parsed shape of the chat-level `gm_config` JSON column (story subset). */
export interface ChatGmConfig {
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

/** Chat columns the story surface needs to build a GM session. */
export interface ChatRow {
  mode: string | null;
  world_id: string | null;
  gm_config: string | null;
  created_by: string;
}

/** Terminal statuses — an open turn is anything else. */
const TURN_TERMINAL_STATUSES: readonly string[] = ["accepted", "escalated",];

/** @returns JSON 404 response for an unknown chat id. */
export function notFound(): Response {
  return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, },);
}

/**
 * @param db
 * @param chatId
 * @returns the chat row, or null when the chat does not exist
 */
export async function loadChat(db: Db, chatId: string,): Promise<ChatRow | null> {
  return await db
    .selectFrom("chats",)
    .select(["mode", "world_id", "gm_config", "created_by",],)
    .where("id", "=", chatId,)
    .executeTakeFirst() ?? null;
}

/**
 * @param db
 * @param chatId
 * @returns the chat's most recent story turn when it is still open, else null
 */
export async function latestOpenTurn(
  db: Db,
  chatId: string,
): Promise<{ id: string; status: string } | null> {
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

/**
 * Parse the chat's gm_config JSON into the story-domain config subset.
 * @param raw - raw `gm_config` column value (null when unset)
 * @returns parsed subset; an empty object for null/unparseable input
 */
export function parseGmConfig(raw: string | null,): ChatGmConfig {
  return jsonParseOr<ChatGmConfig>(raw ?? "{}", {},);
}

/**
 * Build a GameMasterService for one chat, wiring the provider-backed
 * `generateText` callback the GM dispatchers call.
 * @param db
 * @param config
 * @param chatId
 * @param gmConfigRaw - raw chat `gm_config` column value
 * @param userId - caller used for BYO-key resolution
 * @returns a GameMasterService ready for `initialize()`
 */
export function createGm(
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
      db,
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
