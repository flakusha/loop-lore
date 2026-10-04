// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game state persistence service.
 *
 * Extracts fenced game-state blocks from assistant narration, validates
 * them minimally, and stores snapshots per chat. Read APIs return the
 * latest snapshot with its diff against the previous one.
 * @module game-state/service
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { extractGameStateBlock, } from "../regex/game-state";
import { jsonStringifyOr, safeJsonParse, } from "../utils/safe-json";
import { analyzeGameState, type GameState, type GameStateAnalysis, } from "./analyze";

/** Shared options-object shape: a typed Kysely database handle. */
interface DbOptions {
  database: Kysely<DB>;
}

/** Arguments for {@link extractAndStore}. */
export interface ExtractAndStoreArgs extends DbOptions {
  chatId: string;
  messageId: string | null;
  content: string;
}

/** Arguments for {@link getLatestGameState} / {@link getGameStateHistory}. */
export interface ChatQueryArgs extends DbOptions {
  chatId: string;
}

/** Latest snapshot with its diff against the previous persisted state. */
export interface LatestGameState {
  messageId: string | null;
  createdAt: string;
  state: GameState;
  analysis: GameStateAnalysis | null;
}

/** One row of {@link getGameStateHistory} output. */
export interface GameStateHistoryRow {
  id: string;
  messageId: string | null;
  createdAt: string;
}

/**
 * Extract the first fenced game-state block from `content`, validate it
 * minimally, and persist it for the chat.
 *
 * Malformed JSON or a structurally invalid payload is logged (warn) and
 * reported as null — this function NEVER throws for bad content.
 * Minimal sanity: `grid.width`/`grid.height` positive integers and an
 * `entities` array; deeper shape validation happens at the canvas layer.
 * @param args - db handle plus chat/message ids and the narration content
 * @returns the inserted row id, or null when no block is present or the
 *   payload is invalid
 */
export async function extractAndStore(
  args: ExtractAndStoreArgs,
): Promise<string | null> {
  const { database, chatId, messageId, content, } = args;
  const payload = extractGameStateBlock(content,);
  if (payload === null) { return null; }

  const state = safeParse(payload, chatId,);
  if (!state) { return null; }

  const id = crypto.randomUUID();
  await database
    .insertInto("game_states",)
    .values({
      id,
      chat_id: chatId,
      ...(messageId !== null ? { message_id: messageId, } : {}),
      state: jsonStringifyOr(state, "{}",),
    },)
    .execute();

  return id;
}

/**
 * Fetch the latest persisted game state for the chat plus its diff
 * against the previous persisted state.
 *
 * Ordering: `created_at` descending, ties broken by rowid descending.
 * @param args - db handle and chat id to query
 * @returns the latest snapshot with `analysis` (null when there is no
 *   previous row — first-state semantics), or null when no rows exist
 */
export async function getLatestGameState(
  args: ChatQueryArgs,
): Promise<LatestGameState | null> {
  const rows = await args.database
    .selectFrom("game_states",)
    .select(["id", "message_id", "state", "created_at",],)
    .where("chat_id", "=", args.chatId,)
    .orderBy("created_at", "desc",)
    .orderBy(sql`rowid`, "desc",)
    .limit(2,)
    .execute();

  if (rows.length === 0) { return null; }

  const latest = rows[0];
  if (!latest) { return null; }
  const previous = rows[1] ?? null;
  const latestParsed = safeJsonParse<GameState>(latest.state,);
  if (!latestParsed.ok) {
    getLogger().warn("game-state: malformed JSON in persisted state", {
      chatId: args.chatId,
      error: latestParsed.error.message,
    },);

    return null;
  }

  const state = latestParsed.value;
  let priorState: GameState | null = null;
  if (previous) {
    const priorParsed = safeJsonParse<GameState>(previous.state,);
    if (!priorParsed.ok) {
      getLogger().warn("game-state: malformed JSON in persisted state", {
        chatId: args.chatId,
        error: priorParsed.error.message,
      },);

      return null;
    }

    priorState = priorParsed.value;
  }

  return {
    messageId: latest.message_id,
    createdAt: latest.created_at,
    state,
    analysis: analyzeGameState(state, priorState,),
  };
}

/**
 * List persisted game-state rows for the chat, newest first.
 * @param args - chat query options; `limit` defaults to 20
 * @returns `{ id, messageId, createdAt }` rows in descending order
 */
export async function getGameStateHistory(
  args: ChatQueryArgs & { limit?: number },
): Promise<GameStateHistoryRow[]> {
  const rows = await args.database
    .selectFrom("game_states",)
    .select(["id", "message_id", "created_at",],)
    .where("chat_id", "=", args.chatId,)
    .orderBy("created_at", "desc",)
    .orderBy(sql`rowid`, "desc",)
    .limit(args.limit ?? 20,)
    .execute();

  return rows.map((row,) => ({
    id: row.id,
    messageId: row.message_id,
    createdAt: row.created_at,
  }));
}

/**
 * JSON.parse with minimal sanity checks (grid dimensions positive
 * integers, entities array). Failures log a warn and return null.
 * @param payload - raw fenced-block payload to parse
 * @param chatId - chat the payload came from (for log context)
 * @returns the parsed state, or null when malformed/invalid
 */
function safeParse(payload: string, chatId: string,): GameState | null {
  const result = safeJsonParse<GameState>(payload,);
  if (!result.ok) {
    getLogger().warn("game-state: malformed JSON in game-state block", {
      chatId,
      error: result.error.message,
    },);

    return null;
  }

  const parsed = result.value;
  const { width, height, } = parsed.grid ?? {};
  const dimensionsValid = Number.isInteger(width,) && width > 0 &&
    Number.isInteger(height,) && height > 0;

  if (!dimensionsValid || !Array.isArray(parsed.entities,)) {
    getLogger().warn("game-state: payload failed sanity check", { chatId, },);
    return null;
  }

  return parsed;
}
