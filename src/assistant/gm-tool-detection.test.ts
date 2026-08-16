/**
 * GM Tool Detection Tests
 *
 * Tests for the AUX-LLM GM tool detector: pure parse validation and
 * graceful degradation when the AUX model is unavailable.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import { createLogger, } from "../logger";
import { detectGmTool, parseGmToolDetection, } from "./gm-tool-detection";

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
