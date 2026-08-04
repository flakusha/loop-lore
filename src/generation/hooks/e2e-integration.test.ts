/**
 * End-to-End Integration Test: Character Creation → Mood → Emotion → NSFW Policy
 *
 * Tests the full flow from character creation through mood management,
 * emotion detection via hooks, and NSFW policy gating.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { MoodService, } from "../../characters/services/mood-service";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { EmotionHook, } from "./emotion-hook";
import { MoodHook, } from "./mood-hook";
import { NsfwHook, } from "./nsfw-hook";
import { clearHooks, initDefaultHooks, runHookChain, } from "./registry";
import type { HookContext, } from "./types";

describe("E2E: character → mood → emotion → NSFW policy", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let moodService: MoodService;
  const userId = uid();
  const actorId = uid();
  const worldId = uid();
  const chatId = uid();

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    moodService = new MoodService(db,);

    // Seed user
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Test User",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    // Seed world
    await db.insertInto("worlds",).values({
      id: worldId,
      name: "Test World",
      owner_id: userId,
      difficulty_modifier: 1,
      difficulty_reroll: "none",
      difficulty_state: "normal",
    },).execute();

    // Seed character (actor)
    await db.insertInto("actors",).values({
      id: actorId,
      actor_type: "character",
      display_name: "Alice",
      user_id: userId,
      agent_type: "npc",
      settings: "{}",
      visibility: "public",
      import_spec: "{}",
      content_rating: "nsfw_mild",
      template_overrides: "{}",
    },).execute();

    // Seed character availability with NSFW policy
    await db.insertInto("character_availability",).values({
      id: uid(),
      actor_id: actorId,
      status: "available",
      nsfw_policy: JSON.stringify({ level: "moderate", },),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },).execute();

    // Seed chat
    await db.insertInto("chats",).values({
      id: chatId,
      name: "Test Chat",
      type: "direct",
      mode: "direct",
      turn_strategy: null,
      created_by: userId,
      visual_novel: 0,
      is_pinned: "unpinned",
      encryption_level: "standard",
    },).execute();

    // Seed chat participant
    await db.insertInto("chat_participants",).values({
      chat_id: chatId,
      actor_id: actorId,
      role_in_chat: "member",
      talkativity: 5,
      initiative: 5,
      joined_at: new Date().toISOString(),
    },).execute();

    initDefaultHooks();
  },);

  afterAll(async () => {
    clearHooks();
    await db.destroy();
    sqlite.close();
  },);

  test("1. character has NSFW policy in availability", async () => {
    const availability = await db
      .selectFrom("character_availability",)
      .select(["nsfw_policy",],)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    expect(availability,).toBeTruthy();
    const policy = JSON.parse(availability!.nsfw_policy!,) as { level: string };
    expect(policy.level,).toBe("moderate",);
  });

  test("2. mood service creates and retrieves mood", async () => {
    const moodId = await moodService.createMood({
      actorId,
      worldId,
      happiness: 65,
      baseMood: "happy",
      moodStability: 0.4,
    },);
    expect(moodId,).toBeTruthy();

    const mood = await moodService.getMood(actorId, worldId,);
    expect(mood,).toBeTruthy();
    expect(mood!.happiness,).toBe(65,);
    expect(mood!.baseMood,).toBe("happy",);
    expect(mood!.moodStability,).toBeCloseTo(0.4, 1,);
  });

  test("3. mood service applies happiness delta with stability", async () => {
    // Apply negative delta — stability 0.4 means effective delta = -10 * (1 - 0.4*0.5) = -8
    const newHappiness = await moodService.applyHappinessDelta(actorId, worldId, -10,);
    expect(newHappiness,).toBe(57,); // 65 - 8 = 57

    const mood = await moodService.getMood(actorId, worldId,);
    expect(mood!.happiness,).toBe(57,);
    // 57 is in "happy" range (45-59 → "neutral" based on code: >=45 → "neutral", >=60 → "happy")
    expect(mood!.currentMood,).toBe("neutral",);
  });

  test("4. mood hook detects positive mood in happy content", async () => {
    const hook = new MoodHook();
    const ctx: HookContext = {
      chatId,
      actorId,
      userId,
      content: "She smiled with joy and happiness, delighted by the news.",
      config: {} as any,
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
      db,
    };

    const canHandle = await hook.canHandle(ctx.content, ctx,);
    expect(canHandle,).toBe(true,);

    const result = await hook.execute(ctx.content, ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.eventType,).toBe("mood_shift",);
    expect(result.data?.dominantMood,).toBe("positive",);
  });

  test("5. emotion hook detects joy in character response", async () => {
    const hook = new EmotionHook();
    const ctx: HookContext = {
      chatId,
      actorId,
      userId,
      content: "Alice laughed with pure joy, her smile warm and full of delight.",
      config: {} as any,
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
      db,
    };

    const result = await hook.execute(ctx.content, ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.eventType,).toBe("emotion_change",);
    expect(result.data?.dominantEmotion,).toBe("joy",);
  });

  test("6. NSFW hook gates content against actor policy", async () => {
    const hook = new NsfwHook();
    const moderateCtx: HookContext = {
      chatId,
      actorId,
      userId,
      content: "The suggestive and provocative dance was steamy and passionate.",
      nsfwPolicy: "moderate",
      config: {} as any,
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
      db,
    };

    // Moderate content under moderate policy — should be allowed
    const result1 = await hook.execute(moderateCtx.content, moderateCtx,);
    expect(result1.handled,).toBe(true,);
    expect(result1.data?.allowed,).toBe(true,);
    expect(result1.suppressContent,).toBeFalsy();

    // Intense content under moderate policy — should be blocked
    const intenseCtx: HookContext = {
      ...moderateCtx,
      content: "The explicit and graphic scene was brutal and violent.",
    };
    const result2 = await hook.execute(intenseCtx.content, intenseCtx,);
    expect(result2.handled,).toBe(true,);
    expect(result2.suppressContent,).toBe(true,);
    expect(result2.data?.blocked,).toBe(true,);
  });

  test("7. full hook chain processes character response end-to-end", async () => {
    const ctx: HookContext = {
      chatId,
      actorId,
      userId,
      content: "Alice was so happy and filled with joy, her smile showing pure delight and love.",
      nsfwPolicy: "moderate",
      config: {} as any,
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
      db,
    };

    const result = await runHookChain({
      hooks: [...registerAndGetHooks(),],
      context: ctx,
    },);

    expect(result.allowed,).toBe(true,);
    expect(result.events.length,).toBeGreaterThan(0,);

    // Should have mood and emotion events
    const eventTypes = result.events.map((e,) => e.eventType);
    expect(eventTypes,).toContain("mood_shift",);
    expect(eventTypes,).toContain("emotion_change",);
  });

  test("8. hook chain blocks NSFW content exceeding policy", async () => {
    const ctx: HookContext = {
      chatId,
      actorId,
      userId,
      content: "The explicit and graphic scene was brutal with hate and violence.",
      nsfwPolicy: "mild",
      config: {} as any,
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
      db,
    };

    const result = await runHookChain({
      hooks: [...registerAndGetHooks(),],
      context: ctx,
    },);

    expect(result.allowed,).toBe(false,);
    expect(result.suppressedContent,).toBe(true,);
  });

  test("9. targeted eventTypes filter hooks in chain", async () => {
    const ctx: HookContext = {
      chatId,
      actorId,
      userId,
      content: "She was happy and the explicit scene was brutal.",
      nsfwPolicy: "mild",
      eventTypes: ["mood_shift",], // Only run mood hooks
      config: {} as any,
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
      db,
    };

    const result = await runHookChain({
      hooks: [...registerAndGetHooks(),],
      context: ctx,
    },);

    // Only mood hook should have run
    const eventTypes = result.events.map((e,) => e.eventType);
    expect(eventTypes,).toEqual(["mood_shift",],);
    // Even though NSFW content is present, nsfw hook was filtered out
    expect(result.allowed,).toBe(true,);
  });

  test("10. mood events are logged and retrievable", async () => {
    const eventId = await moodService.logEvent({
      actorId,
      worldId,
      eventType: "quest_complete",
      happinessDelta: 15,
      source: "quest",
      sourceId: "quest-123",
    },);
    expect(eventId,).toBeTruthy();

    const events = await moodService.getEvents(actorId, worldId,);
    expect(events.length,).toBeGreaterThan(0,);
    expect(events[0]!.event_type,).toBe("quest_complete",);
    expect(events[0]!.happiness_delta,).toBe(15,);
  });
});

/** Helper: init hooks and return them for chain */
function registerAndGetHooks() {
  initDefaultHooks();
  return [
    new MoodHook(),
    new EmotionHook(),
    new NsfwHook(),
  ];
}
