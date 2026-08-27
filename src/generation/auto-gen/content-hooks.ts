// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content-hook step for auto-generation.
 *
 * Fetches the actor's NSFW policy, runs the configured content hooks (mood,
 * emotion, NSFW, moderation), and extracts the dominant emotion / mood-shift
 * delta from the hook results.
 *
 * The actorId is resolved from the hook event payload (set by the hooks
 * themselves) so consumers don't need to thread it through ambient context.
 * A fallback actorId can be provided for callers that run the chain before
 * the hooks have been updated to emit actorId.
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
import { resolveActorIdFromEvents, } from "./resolve-actor-from-events";

export interface RunContentHooksOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  /** Optional: hooks emit actorId in their event payload (preferred). */
  actorId?: string;
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
  /** Actor ID resolved from the hook event payload. */
  actorId: string | undefined;
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
 * Runs BEFORE the LLM call so NSFW content is never generated for ineligible
 * users. Returns the canonical actor content_rating so the post-LLM hook chain
 * can reuse it without a second DB roundtrip.
 *
 * This is the single source of truth for NSFW gating — both the pre-LLM
 * eligibility check and the post-LLM defense-in-depth scan use the same
 * `canAccessNsfw` helper.
 */
export async function checkNsfwEligibility(opts: {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  actorId: string;
  userId: string;
},): Promise<NsfwEligibilityResult> {
  const { database, config, chatId, actorId, userId, } = opts;

  // Fetch actor's canonical content_rating from actors table
  const actorRow = await database
    .selectFrom("actors",)
    .select(["content_rating",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  const actorContentRating = (actorRow?.content_rating ?? ContentRating.Sfw) as ContentRating;

  // Age-gate precheck (BUG-5232abe — NSFW age gate never verified at generation).
  // canAccessNsfw enforces: NSFW globally enabled, user authenticated, age
  // gate accepted, user above nsfwMinAge. Only NSFW-rated actors require the
  // gate — SFW content never crosses the age threshold, so we skip the DB
  // roundtrip and the false-negative on users without an age-gate accept.
  // Use the canonical isNsfwRating helper (single source of truth for the
  // rating tiers).
  if (isNsfwRating(actorContentRating,)) {
    const access = await canAccessNsfw(database, config, userId,);
    if (!access.allowed) {
      getLogger().child({ module: "auto-gen", },).warn(
        "Generation blocked by NSFW age-gate precheck",
        { actorId, userId, reason: access.reason, chatId, },
      );
      return { allowed: false, reason: access.reason, actorContentRating, };
    }
  }

  return { allowed: true, actorContentRating, };
}

/**
 * Run the content-hook chain before storing a generated message.
 *
 * @returns Whether generation is allowed, plus the extracted dominant emotion
 *   and mood-shift delta, and the actorId resolved from the hook event payload.
 */
export async function runContentHooks(opts: RunContentHooksOpts,): Promise<ContentHooksResult> {
  const { database, config, chatId, userId, content, } = opts;

  // Resolve actorId: prefer the hook event payload (set by the hooks themselves),
  // fall back to the caller-provided actorId for backward compatibility.
  const fallbackActorId = opts.actorId;

  // Fetch actor's canonical content_rating from actors table
  const actorRow = fallbackActorId
    ? await database
      .selectFrom("actors",)
      .select(["content_rating",],)
      .where("id", "=", fallbackActorId,)
      .executeTakeFirst()
    : undefined;
  const actorContentRating = (actorRow?.content_rating ?? ContentRating.Sfw) as ContentRating;
  // Age-gate precheck (BUG-5232abe — NSFW age gate never verified at generation).
  // canAccessNsfw enforces: NSFW globally enabled, user authenticated, age
  // gate accepted, user above nsfwMinAge. Only NSFW-rated actors require the
  // gate — SFW content never crosses the age threshold, so we skip the DB
  // roundtrip and the false-negative on users without an age-gate accept.
  // Use the canonical isNsfwRating helper (single source of truth for the
  // rating tiers).
  if (isNsfwRating(actorContentRating,)) {
    const access = await canAccessNsfw(database, config, userId,);
    if (!access.allowed) {
      getLogger().child({ module: "auto-gen", },).warn(
        "Generation blocked by NSFW age-gate precheck",
        { actorId: fallbackActorId, userId, reason: access.reason, chatId, },
      );
      return { allowed: false, dominantEmotion: undefined, moodShiftDelta: undefined, actorId: fallbackActorId, };
    }
  }

  // Also fetch legacy nsfw_policy from character_availability for backward compat
  const availability = fallbackActorId
    ? await database
      .selectFrom("character_availability",)
      .select(["nsfw_policy",],)
      .where("actor_id", "=", fallbackActorId,)
      .executeTakeFirst()
    : undefined;
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
      actorId: fallbackActorId ?? "",
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
    return {
      allowed: false,
      dominantEmotion: undefined,
      moodShiftDelta: undefined,
      actorId: resolveActorIdFromEvents(hookResult.events,) ?? fallbackActorId,
    };
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

  // Resolve actorId from the hook event payload (preferred) or fall back.
  const actorId = resolveActorIdFromEvents(hookResult.events,) ?? fallbackActorId;

  return { allowed: true, dominantEmotion, moodShiftDelta, actorId, };
}
