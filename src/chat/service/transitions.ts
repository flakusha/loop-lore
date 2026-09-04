// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat transitions: migrate an online chat to a new template-bound chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { carryHistory, } from "./carry-history";
import { carryLocation, } from "./carry-location";
import { carryMemory, } from "./carry-memory";
import { carryParticipants, } from "./carry-participants";
import { carryPins, } from "./carry-pins";
import { carryState, } from "./carry-state";
import { carryWorldState, } from "./carry-world-state";
import { recordLocationChange, } from "./location-events";
import { getChatSetupTemplate, } from "./templates";
import type { MigrateChatParams, MigrateChatResult, } from "./types";

/**
 * Migrate a chat to a new chat bound to a different template, carrying over
 * continuity. This is the sanctioned path for changing key mechanics once a
 * chat is online (the source's mechanics are immutable in place).
 *
 * Creates a new chat with `parent_chat_id = sourceChatId`, seeded from the new
 * template's key mechanics, optionally copying participants, memory, and
 * history. The source chat is left intact as a read-only branch.
 *
 * Idempotency: a source chat may only be migrated once — a second call returns
 * `bad_request` with a pointer to the existing migrated chat.
 * @param database
 * @param chatId
 * @param params
 */
export async function migrateChat(
  database: Kysely<DB>,
  chatId: string,
  params: MigrateChatParams,
): Promise<MigrateChatResult> {
  const source = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!source) {
    return { code: "not_found", message: "Chat not found", };
  }

  // Ownership guard
  if (source.created_by !== params.createdBy) {
    return { code: "forbidden", message: "You do not own this chat", };
  }

  // Idempotency: reject if this source already migrated. Scoped to migrated
  // children (`template_id IS NOT NULL`) so side-channels (which also carry
  // `parent_chat_id` but no template) never block a legitimate migrate.
  const existing = await database
    .selectFrom("chats",)
    .select("id",)
    .where("parent_chat_id", "=", chatId,)
    .where("template_id", "is not", null,)
    .executeTakeFirst();
  if (existing) {
    return { code: "bad_request", message: "This chat has already been migrated", };
  }

  const template = await getChatSetupTemplate(database, params.templateId,);
  if (!template) {
    return { code: "bad_request", message: "Template not found", };
  }

  const newChatId = crypto.randomUUID();
  // The template's `visual_novel` integer flag is migrated into the new chat's
  // `gm_config.renderingOverride` typed enum so we don't need the legacy
  // `chats.visual_novel` column (dropped in migration 076).
  const baseGmConfig = template.gm_config
    ? safeJsonParse<Record<string, unknown>>(template.gm_config,)
    : { ok: false as const, value: null, };
  const renderingOverride = template.visual_novel === 1 ? "visual_novel" : null;
  const mergedGmConfig: Record<string, unknown> = {
    ...(baseGmConfig.ok && baseGmConfig.value ? baseGmConfig.value : {}),
    ...(renderingOverride !== null ? { renderingOverride, } : {}),
  };
  const finalGmConfig = Object.keys(mergedGmConfig,).length > 0
    ? jsonStringifyOr(mergedGmConfig,)
    : null;

  await database
    .insertInto("chats",)
    .values({
      id: newChatId,
      name: params.name ?? `${source.name} (migrated)`,
      type: source.type,
      mode: (template.mode as never) ?? source.mode,
      created_by: params.createdBy,
      world_id: template.world_id ?? source.world_id,
      current_location_id: source.current_location_id,
      turn_strategy: (template.turn_strategy as never) ?? source.turn_strategy,
      gm_config: finalGmConfig,
      parent_chat_id: chatId,
      template_id: template.id,
    },)
    .execute();

  // Record migration event for the new chat's starting location.
  await recordLocationChange(database, {
    chatId: newChatId,
    fromLocationId: null,
    toLocationId: source.current_location_id,
    source: "migration",
  },);

  // Carry participants
  if (params.carry?.participants !== false) {
    await carryParticipants(database, chatId, newChatId,);
  }

  // Carry memory (actor_memories whose source_chat_id points at this chat)
  if (params.carry?.memory === true) {
    await carryMemory(database, chatId, newChatId,);
  }

  // Carry full history (message tree, preserving swipes)
  if (params.carry?.history === "full") {
    await carryHistory(database, chatId, newChatId,);
  }

  // Carry location context (chat_sections + message section links). Runs
  // after carryHistory so the section remap reaches carried messages.
  if (params.carry?.location === true) {
    await carryLocation(database, chatId, newChatId,);
  }

  // Carry party/game state: story_turns, quest_progress, group_initiatives.
  // These are chat-scoped so they re-point cleanly to the migrated chat.
  if (params.carry?.state === true) {
    await carryState(database, chatId, newChatId,);
  }

  // Carry chat pins + VN choice history.
  if (params.carry?.pins === true) {
    await carryPins(database, chatId, newChatId,);
  }

  // Carry world/npc/location state snapshots for the party's world.
  // These are world-scoped (not chat-scoped); when migrating to a template in
  // the same world they are already shared, so this only copies them when the
  // new chat's world differs from the source's.
  if (params.carry?.worldState === true && template.world_id && template.world_id !== source.world_id) {
    await carryWorldState(database, source.world_id ?? "", template.world_id,);
  }

  return { ok: true, newChatId, sourceChatId: chatId, };
}

// ── Narration injection ────────────────────────────────────────────────────────

/**
 * Inject a VN narration system message into a chat. Non-fatal.
 * Used by split/reunion to embed VN branching narration.
 * @param database
 * @param chatId
 * @param text
 */
export async function injectNarration(
  database: Kysely<DB>,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    await database
      .insertInto("messages",)
      .values({
        id: crypto.randomUUID(),
        chat_id: chatId,
        actor_id: "system",
        role: "system" as never,
        content: text,
        content_plaintext: text,
        content_type: "narration" as never,
        content_format: "markdown" as never,
        content_encoding: "identity" as never,
        status: "confirmed" as never,
        visibility: "visible" as never,
      },)
      .execute();
  } catch {
    /* non-fatal */
  }
}
