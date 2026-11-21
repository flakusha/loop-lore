/**
 * GM Tool Detection Tests
 *
 * Tests for the AUX-LLM GM tool detector: pure parse validation and
 * graceful degradation when the AUX model is unavailable.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import { createLogger, } from "../logger";
import { getRegexTelemetrySnapshot, resetRegexTelemetry, setRegexTelemetryEnabled, } from "../regex/telemetry";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import {
  detectGmTool,
  gmToolKeywordGate,
  isGmToolKeywordGateEnabled,
  parseGmToolDetection,
} from "./gm-tool-detection";
import { executeGmToolRequest, } from "./gm-tool-execution";

// ─── Setup ────────────────────────────────────────────────────

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const mockConfig = {
  generation: {
    defaultProvider: "mock-provider",
    defaultModels: { "mock-provider": "mock-model", },
    modelRoles: {},
  },
  templates: {
    llm: { systemPrompts: {}, },
  },
} as any;

const mockDb = {} as any;

// ─── Parse Validation (pure) ──────────────────────────────────

describe("parseGmToolDetection", () => {
  it("parses a valid tool call", () => {
    const result = parseGmToolDetection(
      '{"toolCall":{"name":"roll_dice","params":{"dice":"d20"},"confidence":0.9}}',
    );

    expect(result,).not.toBeNull();
    expect(result?.requested,).toBe(true,);
    expect(result?.name,).toBe("roll_dice",);
    expect(result?.params,).toEqual({ dice: "d20", },);
    expect(result?.confidence,).toBeCloseTo(0.9,);
    expect(result?.source,).toBe("aux-llm",);
  });

  it("marks 'none' as not requested", () => {
    const result = parseGmToolDetection('{"toolCall":{"name":"none","params":{},"confidence":0.8}}',);

    expect(result?.requested,).toBe(false,);
    expect(result?.name,).toBe("none",);
  });

  it("defaults missing params to empty object and confidence to 0.5", () => {
    const result = parseGmToolDetection('{"toolCall":{"name":"summarize"}}',);

    expect(result?.requested,).toBe(true,);
    expect(result?.name,).toBe("summarize",);
    expect(result?.params,).toEqual({},);
    expect(result?.confidence,).toBeCloseTo(0.5,);
  });

  it("rejects unknown tool names", () => {
    expect(parseGmToolDetection('{"toolCall":{"name":"hack_the_planet"}}',),).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseGmToolDetection("not json at all",),).toBeNull();
  });

  it("rejects missing toolCall", () => {
    expect(parseGmToolDetection('{"somethingElse":true}',),).toBeNull();
  });

  it("rejects non-object params", () => {
    const result = parseGmToolDetection('{"toolCall":{"name":"roll_dice","params":"d20"}}',);
    expect(result?.params,).toEqual({},);
  });

  it("clamps confidence above 1 to 1", () => {
    const result = parseGmToolDetection(
      '{"toolCall":{"name":"roll_dice","params":{},"confidence":1.5}}',
    );

    expect(result?.confidence,).toBe(1,);
  });

  it("clamps confidence below 0 to 0", () => {
    const result = parseGmToolDetection(
      '{"toolCall":{"name":"roll_dice","params":{},"confidence":-0.5}}',
    );

    expect(result?.confidence,).toBe(0,);
  });

  it("falls back to 0.5 when confidence is a string", () => {
    const result = parseGmToolDetection(
      '{"toolCall":{"name":"roll_dice","params":{},"confidence":"0.9"}}',
    );

    expect(result?.confidence,).toBe(0.5,);
  });

  it("falls back to 0.5 when confidence is null", () => {
    const result = parseGmToolDetection(
      '{"toolCall":{"name":"roll_dice","params":{},"confidence":null}}',
    );

    expect(result?.confidence,).toBe(0.5,);
  });
});

// ─── Graceful Degradation ─────────────────────────────────────

describe("detectGmTool", () => {
  it("returns null when AUX model is not configured", async () => {
    const result = await detectGmTool("Roll a d20 for me", mockConfig, mockDb,);

    expect(result,).toBeNull();
  });

  it("handles empty content without throwing", async () => {
    const result = await detectGmTool("", mockConfig, mockDb,);

    expect(result,).toBeNull();
  });
});

// ─── Keyword Pre-Gate ───────────────────────────────────────────

describe("gmToolKeywordGate", () => {
  it("marks tool-like content as a candidate", () => {
    expect(gmToolKeywordGate("Roll a d20 for me",),).toBe("candidate",);
  });

  it("skips content with no tool keywords", () => {
    expect(gmToolKeywordGate("hello world, how are you?",),).toBe("skip",);
  });

  it("skips empty content", () => {
    expect(gmToolKeywordGate("",),).toBe("skip",);
  });
});

describe("isGmToolKeywordGateEnabled", () => {
  it("defaults to enabled when unconfigured", () => {
    expect(isGmToolKeywordGateEnabled({ ...mockConfig, },),).toBe(true,);
  });

  it("defaults to enabled for nested or null config", () => {
    expect(isGmToolKeywordGateEnabled({ ...mockConfig, assistant: {}, },),).toBe(true,);
    expect(isGmToolKeywordGateEnabled({ ...mockConfig, features: {}, },),).toBe(true,);
    expect(isGmToolKeywordGateEnabled(null as any,),).toBe(true,);
  });

  it("honours an explicit opt-out", () => {
    expect(isGmToolKeywordGateEnabled({ ...mockConfig, gmToolKeywordGate: false, },),).toBe(false,);
  });

  it("honours the legacy pre-gate key", () => {
    expect(isGmToolKeywordGateEnabled({ ...mockConfig, gmToolKeywordPreGate: false, },),).toBe(false,);
  });
});

// The execution module owns the gate: a skip must short-circuit before AUX.
describe("executeGmToolRequest keyword gate", () => {
  it("skips non-tool prose before invoking the injected detector", async () => {
    const fixture = await createTestDb();
    const { db, } = fixture;
    const userId = "user-gm-gate-test";
    const chatId = "chat-gm-gate-test";
    resetRegexTelemetry();
    setRegexTelemetryEnabled(true,);

    try {
      await insertUsers(db, userId, "Gate User", { id: userId, },);
      await insertActors(db, "Gate User", {
        id: userId,
        actor_type: "user",
        user_id: userId,
        owner_id: userId,
      },);

      await insertChats(db, "Gate Chat", userId, {
        id: chatId,
        gm_config: JSON.stringify({ assistantRole: "gm", },),
      },);

      let detectCalls = 0;
      const outcome = await executeGmToolRequest({
        database: db,
        config: mockConfig,
        actorId: userId,
        chatId,
        content: "The lantern flickered as we crossed the old stone bridge.",
        detect: async () => {
          detectCalls += 1;
          return null;
        },
      },);

      expect(outcome.handled,).toBe(false,);
      expect(detectCalls,).toBe(0,);
      expect(getRegexTelemetrySnapshot(),).toContainEqual({
        pattern: "gm-tool:keyword-gate",
        calls: 1,
        matches: 0,
      },);
    } finally {
      setRegexTelemetryEnabled(false,);
      resetRegexTelemetry();
      await destroyTestDb(fixture,);
    }
  });
});
