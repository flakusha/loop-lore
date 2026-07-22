/**
 * Chat Service Layer
 *
 * Thin business logic layer between routes and database.
 * Routes call these functions; this module calls Kysely.
 *
 * No HTTP concerns here — no Request/Response, no Elysia context.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { computeContextWindow, } from "./context-window";
import { estimateTokens, } from "./context-window";
import { resolveResponseLength, } from "./response-length";
import type { ResponseLengthPreset, } from "./types";
import { resolveFeatureFlags, } from "./types";
import type { ContextWindow, ModeFeatureFlags, ResponseLengthConfig, } from "./types";

// ─── Chat Context ─────────────────────────────────────────────

/**
 * Get the full context state for a chat.
 *
 * Combines chat settings, participants, and message history
 * into a complete ContextWindow state.
 *
 * @param database - Kysely instance
 * @param chatId - Chat ID
 * @returns Context window state, or null if chat not found
 */
export async function getChatContext(
  database: Kysely<DB>,
  chatId: string,
): Promise<ContextWindow | null> {
  const chat = await database
    .selectFrom("chats",)
    .select(["id", "mode", "context_max_tokens", "world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return null; }

  const mode = chat.mode ?? "direct";
  const maxTokens = chat.context_max_tokens ?? 32_000;

  // Get active participants
  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();

  const activeParticipants = participants.map((p,) => p.actor_id);

  // Get recent messages for context window
  const messages = await database
    .selectFrom("messages",)
    .select(["id", "role", "content", "token_count_total", "created_at",],)
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", "visible",)
    .orderBy("created_at", "desc",)
    .limit(100,)
    .execute();

  const messageRefs = messages.reverse().map((m,) => ({
    messageId: m.id,
    role: m.role,
    content: m.content ?? "",
    tokenCount: m.token_count_total ?? estimateTokens(m.content ?? "",),
    createdAt: m.created_at,
  }));

  return computeContextWindow(messageRefs, maxTokens, {
    mode,
    activeParticipants,
  },);
}

// ─── Response Length ───────────────────────────────────────────

/**
 * Get the resolved response length for a chat.
 *
 * @param database - Kysely instance
 * @param chatId - Chat ID
 * @returns Resolved response length configuration
 */
export async function getResponseLength(
  database: Kysely<DB>,
  chatId: string,
): Promise<ResponseLengthConfig> {
  const chat = await database
    .selectFrom("chats",)
    .select(["response_length_preset", "response_length_custom",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  return resolveResponseLength(
    chat?.response_length_preset as ResponseLengthPreset | null,
    chat?.response_length_custom ?? null,
    null, // user global setting (TODO: read from users.settings)
  );
}

// ─── Feature Flags ────────────────────────────────────────────

/**
 * Get feature flags for a chat.
 *
 * @param database - Kysely instance
 * @param chatId - Chat ID
 * @returns Feature flags for this chat's mode
 */
export async function getFeatureFlags(
  database: Kysely<DB>,
  chatId: string,
): Promise<ModeFeatureFlags> {
  const chat = await database
    .selectFrom("chats",)
    .select(["mode",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const mode = chat?.mode ?? "direct";
  return resolveFeatureFlags(mode,);
}
