/**
 * Hook Chain Integration Tests
 *
 * Tests the hook registry, chain runner, and individual hooks
 * (mood, emotion, nsfw, moderation) in isolation and in chain.
 */
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { EmotionHook, } from "./emotion-hook";
import { ModerationHook, } from "./moderation-hook";
import { MoodHook, } from "./mood-hook";
import { NsfwHook, type NsfwHookDeps, } from "./nsfw-hook";
import { clearHooks, getRegisteredHooks, initDefaultHooks, registerHook, runHookChain, } from "./registry";
import type { HookContext, } from "./types";

// ── Helpers ──────────────────────────────────────────────────

function makeContext(overrides?: Partial<HookContext>,): HookContext {
  return {
    chatId: "chat-1",
    actorId: "actor-1",
    userId: "user-1",
    content: "Hello world",
    config: {} as any,
    nsfwConfig: {
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: true,
      useLlmClassifier: false,
    },
    db: {} as any,
    ...overrides,
  };
}

// ── Registry ─────────────────────────────────────────────────

describe("hook registry", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  afterAll(() => {
    clearHooks();
  },);

  test("registerHook adds to registry", () => {
    clearHooks();
    const hook = new MoodHook();
    registerHook(hook,);
    expect(getRegisteredHooks(),).toHaveLength(1,);
    expect(getRegisteredHooks()[0]!.name,).toBe("mood",);
  });

  test("clearHooks empties registry", () => {
    registerHook(new MoodHook(),);
    registerHook(new EmotionHook(),);
    clearHooks();
    expect(getRegisteredHooks(),).toHaveLength(0,);
  });

  test("initDefaultHooks registers all 4 hooks", () => {
    initDefaultHooks();
    const hooks = getRegisteredHooks();
    expect(hooks,).toHaveLength(4,);
    expect(hooks.map((h,) => h.name),).toEqual(["mood", "emotion", "nsfw", "moderation",],);
  });
});

// ── MoodHook ─────────────────────────────────────────────────

describe("MoodHook", () => {
  const hook = new MoodHook();

  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("name and eventTypes", () => {
    expect(hook.name,).toBe("mood",);
    expect(hook.eventTypes,).toEqual(["mood_shift",],);
  });

  test("canHandle returns false for short content", async () => {
    const ctx = makeContext({ content: "Hi", },);
    expect(await hook.canHandle("Hi", ctx,),).toBe(false,);
  });

  test("canHandle returns true for content > 10 chars", async () => {
    const ctx = makeContext({ content: "I am so happy today!", },);
    expect(await hook.canHandle("I am so happy today!", ctx,),).toBe(true,);
  });

  test("execute detects positive mood", async () => {
    const ctx = makeContext({ content: "I am so happy and joyful today!", },);
    const result = await hook.execute("I am so happy and joyful today!", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.eventType,).toBe("mood_shift",);
    expect(result.data?.dominantMood,).toBe("positive",);
    expect(result.data?.delta,).toBe(5,);
  });

  test("execute detects negative mood", async () => {
    const ctx = makeContext({ content: "I feel sad and angry and frustrated.", },);
    const result = await hook.execute("I feel sad and angry and frustrated.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.data?.dominantMood,).toBe("negative",);
    expect(result.data?.delta,).toBe(-5,);
  });

  test("execute returns unhandled for neutral content", async () => {
    const ctx = makeContext({ content: "The weather is okay today.", },);
    const result = await hook.execute("The weather is okay today.", ctx,);
    expect(result.handled,).toBe(false,);
  });
});

// ── EmotionHook ──────────────────────────────────────────────

describe("EmotionHook", () => {
  const hook = new EmotionHook();

  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("name and eventTypes", () => {
    expect(hook.name,).toBe("emotion",);
    expect(hook.eventTypes,).toEqual(["emotion_change",],);
  });

  test("canHandle returns false for short content", async () => {
    const ctx = makeContext();
    expect(await hook.canHandle("Hi", ctx,),).toBe(false,);
  });

  test("execute detects joy", async () => {
    const ctx = makeContext({ content: "She laughed with pure joy and happiness.", },);
    const result = await hook.execute("She laughed with pure joy and happiness.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.eventType,).toBe("emotion_change",);
    expect(result.data?.dominantEmotion,).toBe("joy",);
  });

  test("execute detects anger", async () => {
    const ctx = makeContext({ content: "He was furious and full of rage.", },);
    const result = await hook.execute("He was furious and full of rage.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.data?.dominantEmotion,).toBe("anger",);
  });

  test("execute detects fear", async () => {
    const ctx = makeContext({ content: "She was terrified and scared beyond belief.", },);
    const result = await hook.execute("She was terrified and scared beyond belief.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.data?.dominantEmotion,).toBe("fear",);
  });

  test("execute detects love", async () => {
    const ctx = makeContext({ content: "He felt deep love and tender affection.", },);
    const result = await hook.execute("He felt deep love and tender affection.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.data?.dominantEmotion,).toBe("love",);
  });

  test("execute returns unhandled for emotionless content", async () => {
    const ctx = makeContext({ content: "The rock formation is tall.", },);
    const result = await hook.execute("The rock formation is tall.", ctx,);
    expect(result.handled,).toBe(false,);
  });
});

// ── NsfwHook ─────────────────────────────────────────────────

describe("NsfwHook", () => {
  const hook = new NsfwHook();

  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("name and eventTypes", () => {
    expect(hook.name,).toBe("nsfw",);
    expect(hook.eventTypes,).toEqual(["nsfw_gate", "privacy_check",],);
  });

  test("canHandle returns false when NSFW disabled", async () => {
    const ctx = makeContext({
      content: "This is suggestive content with enough length.",
      nsfwConfig: {
        allowNsfw: false,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    expect(await hook.canHandle("This is suggestive content with enough length.", ctx,),).toBe(false,);
  });

  test("canHandle returns false for short content", async () => {
    const ctx = makeContext({
      content: "Short",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    expect(await hook.canHandle("Short", ctx,),).toBe(false,);
  });

  test("canHandle returns true when NSFW enabled and content long enough", async () => {
    const ctx = makeContext({
      content: "This is suggestive content with enough length.",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    expect(await hook.canHandle("This is suggestive content with enough length.", ctx,),).toBe(true,);
  });

  test("execute blocks intense content under mild policy", async () => {
    const ctx = makeContext({
      content: "The graphic and explicit scene was brutal and violent.",
      nsfwPolicy: "mild",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    const result = await hook.execute("The graphic and explicit scene was brutal and violent.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.suppressContent,).toBe(true,);
    expect(result.data?.nsfwLevel,).toBe("intense",);
    expect(result.data?.blocked,).toBe(true,);
  });

  test("execute allows moderate content under intense policy", async () => {
    const ctx = makeContext({
      content: "The suggestive and provocative dance was steamy.",
      nsfwPolicy: "intense",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    const result = await hook.execute("The suggestive and provocative dance was steamy.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.suppressContent,).toBeFalsy();
    expect(result.data?.nsfwLevel,).toBe("moderate",);
    expect(result.data?.allowed,).toBe(true,);
  });

  test("execute returns unhandled for SFW content", async () => {
    const ctx = makeContext({
      content: "They walked through the garden and admired the flowers.",
      nsfwPolicy: "mild",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    const result = await hook.execute("They walked through the garden and admired the flowers.", ctx,);
    expect(result.handled,).toBe(false,);
  });

  describe("LLM classifier", () => {
    // The LLM tap is only reached for keyword-"none" content when
    // useLlmClassifier is true. Inject a mock runner so no real LLM call fires.
    function llmLlContext(content: string, extraNsfw?: Record<string, unknown>,) {
      return makeContext({
        content,
        nsfwPolicy: "mild",
        // Test double: partial NsfwConfig + useLlmClassifier flag.
        nsfwConfig: {
          allowNsfw: true,
          nsfwMinAge: 18,
          defaultNsfwScope: "chat",
          consentRequired: true,
          auditLogging: true,
          useLlmClassifier: true,
          ...extraNsfw,
        } as unknown as HookContext["nsfwConfig"],
        // Test double: only templates.llm is read by the hook.
        config: {
          templates: {
            llm: {
              systemPrompts: { nsfw: "custom nsfw classifier", },
            },
          },
        } as unknown as HookContext["config"],
        db: {} as unknown as HookContext["db"],
      },);
    }

    test("classifies content the keyword pass missed via the nsfw prompt", async () => {
      const aux = mock(async () => ({
        content: JSON.stringify({ rating: "nsfw_intense", confidence: 0.9, },),
      }));
      const llmHook = new NsfwHook({ callAux: aux as unknown as NsfwHookDeps["callAux"], },);
      const ctx = llmLlContext("The two embraced in a long, lingering way.",);

      const result = await llmHook.execute("The two embraced in a long, lingering way.", ctx,);
      expect(aux,).toHaveBeenCalled();
      expect(result.handled,).toBe(true,);
      expect(result.data?.nsfwLevel,).toBe("intense",);
      // intense > mild policy → blocked
      expect(result.suppressContent,).toBe(true,);
    });

    test("sfw LLM rating leaves content unhandled (no block)", async () => {
      const aux = mock(async () => ({
        content: JSON.stringify({ rating: "sfw", confidence: 0.9, },),
      }));
      const llmHook = new NsfwHook({ callAux: aux as unknown as NsfwHookDeps["callAux"], },);
      const ctx = llmLlContext("They discussed the weather at length today.",);

      const result = await llmHook.execute("They discussed the weather at length today.", ctx,);
      expect(result.handled,).toBe(false,);
    });

    test("LLM failure degrades gracefully without blocking", async () => {
      const aux = mock(async () => null);
      const llmHook = new NsfwHook({ callAux: aux as unknown as NsfwHookDeps["callAux"], },);
      const ctx = llmLlContext("The two embraced in a long, lingering way.",);

      const result = await llmHook.execute("The two embraced in a long, lingering way.", ctx,);
      expect(result.handled,).toBe(false,);
    });

    test("LLM classifier is skipped when useLlmClassifier is false", async () => {
      const aux = mock(async () => ({
        content: JSON.stringify({ rating: "nsfw_extreme", confidence: 0.9, },),
      }));
      const llmHook = new NsfwHook({ callAux: aux as unknown as NsfwHookDeps["callAux"], },);
      const ctx = makeContext({
        content: "They discussed neutral things for a while.",
        nsfwPolicy: "mild",
        nsfwConfig: {
          allowNsfw: true,
          nsfwMinAge: 18,
          defaultNsfwScope: "chat",
          consentRequired: true,
          auditLogging: true,
          useLlmClassifier: false,
        },
      },);

      const result = await llmHook.execute("They discussed neutral things for a while.", ctx,);
      expect(result.handled,).toBe(false,);
      expect(aux,).not.toHaveBeenCalled();
    });
  });
});

// ── ModerationHook ───────────────────────────────────────────

describe("ModerationHook", () => {
  const hook = new ModerationHook();

  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("name and eventTypes", () => {
    expect(hook.name,).toBe("moderation",);
    expect(hook.eventTypes,).toEqual(["moderation_flag",],);
  });

  test("canHandle returns false for short content", async () => {
    const ctx = makeContext();
    expect(await hook.canHandle("Hi", ctx,),).toBe(false,);
  });

  test("execute flags severe content", async () => {
    const ctx = makeContext({ content: "This is a hate-filled threat of violence.", },);
    const result = await hook.execute("This is a hate-filled threat of violence.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.suppressContent,).toBe(true,);
    expect(result.data?.flags,).toContain("severe",);
  });

  test("execute flags moderate content without suppression", async () => {
    const ctx = makeContext({ content: "That was a rude and offensive insult.", },);
    const result = await hook.execute("That was a rude and offensive insult.", ctx,);
    expect(result.handled,).toBe(true,);
    expect(result.suppressContent,).toBeFalsy();
    expect(result.data?.flags,).toContain("moderate",);
  });

  test("execute returns unhandled for clean content", async () => {
    const ctx = makeContext({ content: "Have a wonderful day full of kindness!", },);
    const result = await hook.execute("Have a wonderful day full of kindness!", ctx,);
    expect(result.handled,).toBe(false,);
  });
});

// ── Chain Integration ────────────────────────────────────────

describe("runHookChain", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
    initDefaultHooks();
  },);

  afterAll(() => {
    clearHooks();
  },);

  test("chain allows clean content", async () => {
    const ctx = makeContext({
      content: "The weather is pleasant today.",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    const result = await runHookChain({ context: ctx, hooks: [...getRegisteredHooks(),], },);
    expect(result.allowed,).toBe(true,);
    expect(result.suppressedContent,).toBe(false,);
  });

  test("chain suppresses NSFW content exceeding policy", async () => {
    const ctx = makeContext({
      content: "The graphic and explicit scene was brutal and violent with hate.",
      nsfwPolicy: "mild",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    const result = await runHookChain({ context: ctx, hooks: [...getRegisteredHooks(),], },);
    expect(result.allowed,).toBe(false,);
    expect(result.suppressedContent,).toBe(true,);
    // Should have events from mood, emotion, nsfw, and moderation
    expect(result.events.length,).toBeGreaterThan(0,);
  });

  test("chain runs mood and emotion hooks on emotional content", async () => {
    const ctx = makeContext({
      content: "She was so happy and filled with joy and love today!",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    const result = await runHookChain({ context: ctx, hooks: [...getRegisteredHooks(),], },);
    expect(result.allowed,).toBe(true,);
    const eventTypes = result.events.map((e,) => e.eventType);
    expect(eventTypes,).toContain("mood_shift",);
    expect(eventTypes,).toContain("emotion_change",);
  });

  test("chain skips hooks that cannot handle content", async () => {
    const ctx = makeContext({
      content: "Short",
      nsfwConfig: {
        allowNsfw: true,
        nsfwMinAge: 18,
        defaultNsfwScope: "chat",
        consentRequired: true,
        auditLogging: true,
        useLlmClassifier: false,
      },
    },);
    const result = await runHookChain({ context: ctx, hooks: [...getRegisteredHooks(),], },);
    // All hooks require content > 10 or > 20 chars, so none run
    expect(result.results,).toHaveLength(0,);
    expect(result.allowed,).toBe(true,);
  });
});
