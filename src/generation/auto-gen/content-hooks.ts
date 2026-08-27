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
import { ContentRating, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { canAccessNsfw, } from "../../middleware/nsfw-gate/access";
import { isNsfwRating, } from "../../middleware/nsfw-gate/constants";
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

export interface NsfwEligibilityResult {
  /** True when generation may proceed; false when blocked. */
  allowed: boolean;
  /** Reason code (matches canAccessNsfw.reason) — present when allowed=false. */
  reason?: string;
  /** Resolved actor content_rating (canonical enum) — reused by post-LLM hook chain. */
  actorContentRating: ContentRating;
}
/**
 * Pre-LLM NSFW eligibility check.
 *
 * Resolves the actor's canonical content_rating and verifies the user is
 * permitted to access NSFW content (config toggle, age gate, minimum age).
 * Intended to run BEFORE the LLM call so blocked generations cost nothing.
 *
 * SFW-rated actors skip the user-side check (no DB user lookup) — SFW content
 * never crosses the age threshold, so the check is unnecessary and avoids a
 * false-negative on users without an age-gate accept.
 *
 * Resolves BUG-5232abe (HIGH) + BUG-f0683a8 (CRIT) follow-up. Both are already
 * mitigated post-LLM by runContentHooks, but THIS function lets callers block
 * BEFORE the LLM (avoiding token spend on a generation that would never be
 * stored). The post-LLM check inside runContentHooks remains as
 * defense-in-depth.
 */
export async function checkNsfwEligibility(
  opts: {
    database: Kysely<DB>;
    config: Config;
    actorId: string;
    userId: string;
    chatId?: string;
  },
): Promise<NsfwEligibilityResult> {
  const { database, config, actorId, userId, chatId, } = opts;

  const actorRow = await database
    .selectFrom("actors",)
    .select(["content_rating",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  const actorContentRating = (actorRow?.content_rating ?? ContentRating.Sfw) as ContentRating;

  if (!isNsfwRating(actorContentRating,)) {
    return { allowed: true, actorContentRating, };
  }

  const access = await canAccessNsfw(database, config, userId,);
  if (!access.allowed) {
    getLogger().child({ module: "auto-gen", },).warn(
      "Generation blocked by NSFW age-gate precheck",
      { actorId, userId, reason: access.reason, chatId, },
    );
    return { allowed: false, reason: access.reason, actorContentRating, };
  }
  return { allowed: true, actorContentRating, };
}

/**
 * Run the content-hook chain before storing a generated message.
 *
 * @returns Whether generation is allowed, plus the extracted dominant emotion
 *   and mood-shift delta.
 */
export async function runContentHooks(opts: RunContentHooksOpts,): Promise<ContentHooksResult> {
  const { database, config, chatId, actorId, userId, content, } = opts;

  // Age-gate precheck (BUG-5232abe — NSFW age gate never verified at generation).
  // Delegates to checkNsfwEligibility (also called pre-LLM by callers). Kept
  // here as defense-in-depth so the post-LLM chain can never persist content
  // when the user would have been blocked.
  const eligibility = await checkNsfwEligibility({
    database,
    config,
    actorId,
    userId,
    chatId,
  },);
  if (!eligibility.allowed) {
    return { allowed: false, dominantEmotion: undefined, moodShiftDelta: undefined, };
  }
  const { actorContentRating, } = eligibility;



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
