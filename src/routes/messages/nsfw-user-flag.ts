// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lightweight NSFW check on user-submitted messages.
 * Flags (warns) when content contains NSFW keywords and the user's max_rating
 * is below nsfw_intense. Does NOT suppress or block the message.
 */

import { getLogger, } from "../../logger";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import type { HandlerOpts, } from "./types";

const NSFW_KEYWORDS = ["explicit", "graphic", "violent", "brutal", "gore", "torture", "mutilation",];
const RATING_ORDER = ["sfw", "nsfw_mild", "nsfw_moderate", "nsfw_intense", "nsfw_extreme",];

/**
 * Lightweight NSFW check on user-submitted messages.
 * Flags (warns) when content contains NSFW keywords and the user's max_rating
 * is below nsfw_intense. Does NOT suppress or block the message.
 * @param database
 * @param userId
 * @param chatId
 * @param content
 */
export async function flagNsfwUserMessage(
  database: HandlerOpts["database"],
  userId: string,
  chatId: string,
  content: string,
): Promise<void> {
  try {
    const userPrefs = await database
      .selectFrom("nsfw_user_preferences",)
      .select(["max_rating",],)
      .where("user_id", "=", userId,)
      .executeTakeFirst();
    const maxRating = userPrefs?.max_rating ?? "sfw";
    const lower = content.toLowerCase();
    let detectedNsfw = false;
    for (const kw of NSFW_KEYWORDS) {
      if (lower.includes(kw,)) {
        detectedNsfw = true;
        break;
      }
    }
    if (!detectedNsfw) { return; }
    const maxIndex = RATING_ORDER.indexOf(maxRating,);
    if (maxIndex === -1 || maxIndex >= RATING_ORDER.indexOf("nsfw_intense",)) { return; }
    getLogger().warn("nsfw: user message exceeds max rating", {
      userId,
      maxRating,
      chatId,
    },);
    const modService = new NsfwModerationService(database,);
    try {
      await modService.recordAction({
        actionType: "user_nsfw_warning",
        targetUserId: userId,
        performedBy: "system",
        reason: `User message contains NSFW keywords exceeding max_rating "${maxRating}"`,
        scope: "chat",
        scopeId: chatId,
      },);
    } catch {
      // audit logging failure is non-critical
    }
  } catch {
    // DB not available — skip silently
  }
}
