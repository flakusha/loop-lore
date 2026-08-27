// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — per-chat/world overrides
 *
 * Computing the effective NSFW setting for a chat and setting chat/world
 * level overrides.
 */
import type { NsfwModerationServiceContext, NsfwUserPrefs, } from "./types";

export interface GetEffectiveNsfwArgs {
  thisL: NsfwModerationServiceContext;
  chatId: string;
  userId: string;
}

/**
 * Get the effective NSFW setting for a chat, considering chat override,
 * world override, and user preference in that order.
 */
export async function getEffectiveNsfw(
  { thisL, chatId, userId, }: GetEffectiveNsfwArgs,
): Promise<{ enabled: boolean; source: string }> {
  // 0. Check if user is shadow-banned from NSFW (overrides everything)
  const prefs = (await thisL.getPreferences(userId,)) ?? ({} as NsfwUserPrefs);
  if (prefs?.shadowNsfw) {
    return { enabled: false, source: "shadow_ban", };
  }

  // 1. Check chat-level override
  const chat = await thisL.db.selectFrom("chats",)
    .select(["nsfw_override", "world_id", "type",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  if (chat?.nsfw_override === "enabled") { return { enabled: true, source: "chat_override", }; }
  if (chat?.nsfw_override === "disabled") { return { enabled: false, source: "chat_override", }; }

  // 2. Check world-level override (if chat has a world)
  if (chat?.world_id) {
    const world = await thisL.db.selectFrom("worlds",)
      .select("nsfw_override",)
      .where("id", "=", chat.world_id,)
      .executeTakeFirst();
    if (world?.nsfw_override === "enabled") { return { enabled: true, source: "world_override", }; }
    if (world?.nsfw_override === "disabled") { return { enabled: false, source: "world_override", }; }
  }

  // No row → schema default nsfw_enabled=1 is "enabled". Keep the fallback in
  // sync with that default; defaulting to false here caused hooks to globally
  // block users who never explicitly opted out (see e2e-integration test).
  return { enabled: prefs?.nsfwEnabled ?? true, source: "user_preference", };
}

export interface SetChatNsfwOverrideArgs {
  thisL: NsfwModerationServiceContext;
  chatId: string;
  override: "enabled" | "disabled" | null;
  performedBy: string;
}

/**
 * Set NSFW override for a chat. Pass null to clear (revert to user pref).
 *
 * Service-level guard: the chat must exist (fail fast instead of a silent
 * no-op update) and every change is attributed to `performedBy` with an
 * audit row, so callers that bypass the HTTP route are still on record.
 */
export async function setChatNsfwOverride(
  { thisL, chatId, override, performedBy, }: SetChatNsfwOverrideArgs,
): Promise<void> {
  const chat = await thisL.db.selectFrom("chats",)
    .select("id",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  if (!chat) {
    throw new Error(`chat_not_found:${chatId}`);
  }
  await thisL.db.updateTable("chats",)
    .set({ nsfw_override: override, },)
    .where("id", "=", chatId,)
    .execute();
  thisL.log.info("Chat NSFW override updated", { chatId, override, performedBy, },);
  await thisL.recordAction({
    actionType: "nsfw_override_set",
    targetUserId: performedBy,
    performedBy,
    reason: `chat nsfw_override set to ${override ?? "null"}`,
    scope: "chat",
    scopeId: chatId,
  },);
}

export interface SetWorldNsfwOverrideArgs {
  thisL: NsfwModerationServiceContext;
  worldId: string;
  override: "enabled" | "disabled" | null;
  performedBy: string;
}

/**
 * Set NSFW override for a world. Pass null to clear (revert to user pref).
 * Same service-level guard as the chat variant: existence check + audit.
 */
export async function setWorldNsfwOverride(
  { thisL, worldId, override, performedBy, }: SetWorldNsfwOverrideArgs,
): Promise<void> {
  const world = await thisL.db.selectFrom("worlds",)
    .select("id",)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) {
    throw new Error(`world_not_found:${worldId}`);
  }
  await thisL.db.updateTable("worlds",)
    .set({ nsfw_override: override, },)
    .where("id", "=", worldId,)
    .execute();
  thisL.log.info("World NSFW override updated", { worldId, override, performedBy, },);
  await thisL.recordAction({
    actionType: "nsfw_override_set",
    targetUserId: performedBy,
    performedBy,
    reason: `world nsfw_override set to ${override ?? "null"}`,
    scope: "world",
    scopeId: worldId,
  },);
}
