// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — per-chat/world overrides
 *
 * Computing the effective NSFW setting for a chat and setting chat/world
 * level overrides.
 */
import type { NsfwModerationServiceContext, } from "./types";

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
  const prefs = await thisL.getPreferences(userId,);
  if (prefs.shadowNsfw) {
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

  // 3. Fall back to user preference
  return { enabled: prefs.nsfwEnabled, source: "user_preference", };
}

export interface SetChatNsfwOverrideArgs {
  thisL: NsfwModerationServiceContext;
  chatId: string;
  override: "enabled" | "disabled" | null;
}

/** Set NSFW override for a chat. Pass null to clear (revert to user pref). */
export async function setChatNsfwOverride(
  { thisL, chatId, override, }: SetChatNsfwOverrideArgs,
): Promise<void> {
  await thisL.db.updateTable("chats",)
    .set({ nsfw_override: override, },)
    .where("id", "=", chatId,)
    .execute();
  thisL.log.info("Chat NSFW override updated", { chatId, override, },);
}

export interface SetWorldNsfwOverrideArgs {
  thisL: NsfwModerationServiceContext;
  worldId: string;
  override: "enabled" | "disabled" | null;
}

/** Set NSFW override for a world. Pass null to clear (revert to user pref). */
export async function setWorldNsfwOverride(
  { thisL, worldId, override, }: SetWorldNsfwOverrideArgs,
): Promise<void> {
  await thisL.db.updateTable("worlds",)
    .set({ nsfw_override: override, },)
    .where("id", "=", worldId,)
    .execute();
  thisL.log.info("World NSFW override updated", { worldId, override, },);
}
