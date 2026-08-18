// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content-hook step for auto-generation.
 *
 * Fetches the actor's NSFW policy, runs the configured content hooks (mood,
 * emotion, NSFW, moderation), and extracts the dominant emotion / mood-shift
 * delta from the hook results.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { jsonParseOr, } from "../../utils";
import { getRegisteredHooks, runHookChain, } from "../hooks";
import type { HookEventType, } from "../hooks";

export interface RunContentHooksOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  actorId: string;
  userId: string;
  content: string;
}

export interface ContentHooksResult {
  /** False when a hook blocked generation. */
  allowed: boolean;
  /** Dominant emotion detected by the emotion hook (for per-message avatar). */
  dominantEmotion: string | undefined;
  /** Mood-shift delta detected by the mood hook. */
  moodShiftDelta: number | undefined;
}

/**
 * Run the content-hook chain before storing a generated message.
 *
 * @returns Whether generation is allowed, plus the extracted dominant emotion
 *   and mood-shift delta.
 */
export async function runContentHooks(opts: RunContentHooksOpts,): Promise<ContentHooksResult> {
  const { database, config, chatId, actorId, userId, content, } = opts;

  // Fetch actor's canonical content_rating from actors table
  const actorRow = await database
    .selectFrom("actors",)
    .select(["content_rating",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  const actorContentRating = (actorRow?.content_rating as string) ?? "sfw";

  // Also fetch legacy nsfw_policy from character_availability for backward compat
  const availability = await database
    .selectFrom("character_availability",)
    .select(["nsfw_policy",],)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  const nsfwPolicy = availability?.nsfw_policy
    ? jsonParseOr<Record<string, unknown>>(availability.nsfw_policy, {},).level as string | undefined
    : undefined;

  // Fetch user's max content rating from nsfw_user_preferences
  const userPrefs = await database
    .selectFrom("nsfw_user_preferences",)
    .select(["max_rating",],)
    .where("user_id", "=", userId,)
    .executeTakeFirst();
  const maxUserRating = userPrefs?.max_rating;

  // Fetch chat-level NSFW override
  const chatRow = await database
    .selectFrom("chats",)
    .select(["nsfw_override",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  const chatNsfwOverride = chatRow?.nsfw_override;

  // Determine which hook event types to run based on config
  const hooksConfig = config.hooks ?? {
    enableMoodHooks: true,
    enableEmotionHooks: true,
    enableNsfwHooks: true,
    enableModerationHooks: true,
  };
  const enabledEventTypes: HookEventType[] = [];
  if (hooksConfig.enableMoodHooks) { enabledEventTypes.push("mood_shift",); }
  if (hooksConfig.enableEmotionHooks) { enabledEventTypes.push("emotion_change",); }
  if (hooksConfig.enableNsfwHooks) { enabledEventTypes.push("nsfw_gate", "privacy_check",); }
  if (hooksConfig.enableModerationHooks) { enabledEventTypes.push("moderation_flag",); }

  const hookResult = await runHookChain({
    hooks: [...getRegisteredHooks(),],
    context: {
      chatId,
      actorId,
      userId,
      content,
      nsfwPolicy,
      actorContentRating,
      maxUserRating,
      chatNsfwOverride,
      privacyLevel: "standard",
      eventTypes: enabledEventTypes,
      config,
      nsfwConfig: config.nsfw ??
        { allowNsfw: false, nsfwMinAge: 0, defaultNsfwScope: "chat", consentRequired: true, auditLogging: true, },
      db: database,
    },
  },);

  if (!hookResult.allowed) {
    getLogger().child({ module: "auto-gen", },).warn("Generation blocked by content hooks", {
      reason: Array.from(hookResult.events, (e,) => e.reason,).join("; ",),
    },);
    return { allowed: false, dominantEmotion: undefined, moodShiftDelta: undefined, };
  }

  // Extract the dominant emotion detected by the EmotionHook (emotion_change
  // event) so it can be bound to this message for per-message avatar rendering.
  const dominantEmotion = hookResult.events.find(
    (e,) => e.eventType === "emotion_change" && typeof e.data?.dominantEmotion === "string",
  )?.data?.dominantEmotion as string | undefined;

  // Extract the mood-shift delta for post-store persistence.
  const moodShift = hookResult.events.find(
    (e,) => e.eventType === "mood_shift" && typeof e.data?.delta === "number",
  );
  const moodShiftDelta = moodShift && typeof moodShift.data?.delta === "number"
    ? moodShift.data.delta
    : undefined;

  return { allowed: true, dominantEmotion, moodShiftDelta, };
}
