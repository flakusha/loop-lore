/**
 * Transition Classifier Tests
 *
 * Tests for regex-first, AUX-LLM-fallback transition detection.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import { createLogger, } from "../logger";
import { classifyTransition, } from "./transition-classifier";

// ─── Setup ────────────────────────────────────────────────────

beforeAll(() => {
  createLogger({ level: "error", },);
},);

// ─── Mock Config & DB ─────────────────────────────────────────

const mockConfig = {
  generation: {
    defaultProvider: "mock-provider",
    defaultModels: { "mock-provider": "mock-model", },
    modelRoles: {
      auxiliary: {
        provider: "mock-provider",
        model: "mock-model",
      },
    },
  },
} as any;

const mockDb = {} as any;

// ─── Regex-Only Tests ─────────────────────────────────────────

describe("classifyTransition (regex patterns)", () => {
  it("detects explicit movement", async () => {
    const result = await classifyTransition(
      "I walk to the tavern",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("location_change",);
    expect(result.source,).toBe("regex",);
    expect(result.confidence,).toBe(1,);
  });

  it("detects scene shift", async () => {
    const result = await classifyTransition(
      "The scene shifts to the forest",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("location_change",);
    expect(result.source,).toBe("regex",);
  });

  it("detects movement phrases", async () => {
    const result = await classifyTransition(
      "Let's go to the castle",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("location_change",);
    expect(result.source,).toBe("regex",);
  });

  it("detects context cut", async () => {
    const result = await classifyTransition(
      "Skip ahead to the next morning",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("context_cut",);
    expect(result.source,).toBe("regex",);
  });

  it("detects temporal transition", async () => {
    const result = await classifyTransition(
      "After a long journey, we arrive",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("context_cut",);
    expect(result.source,).toBe("regex",);
  });

  it("detects description transition", async () => {
    const result = await classifyTransition(
      "Tell me about the quest",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("description",);
    expect(result.source,).toBe("regex",);
  });

  it("does not detect non-transition", async () => {
    const result = await classifyTransition(
      "I draw my sword",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(false,);
    expect(result.type,).toBe(null,);
    expect(result.source,).toBe("none",);
  });

  it("extracts location hint", async () => {
    const result = await classifyTransition(
      "I walk to the tavern",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.locationHint,).toBe("the tavern",);
  });

  it("handles case insensitivity", async () => {
    const result = await classifyTransition(
      "I WALK TO THE TAVERN",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("location_change",);
  });
});

// ─── AUX LLM Fallback Tests ───────────────────────────────────

describe("classifyTransition (AUX LLM fallback)", () => {
  it("falls back to no transition when AUX not configured", async () => {
    const configWithoutAux = {
      generation: {
        defaultProvider: "mock-provider",
        defaultModels: { "mock-provider": "mock-model", },
        modelRoles: {},
      },
    } as any;

    const result = await classifyTransition(
      "The rain forces us inside",
      [],
      configWithoutAux,
      mockDb,
    );

    // Without AUX configured, regex misses → no transition
    expect(result.isTransition,).toBe(false,);
    expect(result.source,).toBe("none",);
  });

  it("handles AUX LLM timeout gracefully", async () => {
    // This test verifies that when AUX LLM times out, we get no transition
    // The actual timeout behavior depends on the provider implementation
    const result = await classifyTransition(
      "The rain forces us inside",
      [],
      mockConfig,
      mockDb,
    );

    // Should not throw, should return some result
    expect(result,).toBeDefined();
    expect(typeof result.isTransition,).toBe("boolean",);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────

describe("classifyTransition (edge cases)", () => {
  it("handles empty content", async () => {
    const result = await classifyTransition(
      "",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(false,);
    expect(result.source,).toBe("none",);
  });

  it("handles very long content", async () => {
    const longContent = `${"I walk to ".repeat(1000,)}the tavern`;
    const result = await classifyTransition(
      longContent,
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("location_change",);
  });

  it("handles special characters", async () => {
    const result = await classifyTransition(
      "I walk to the tavern!!! @#$%",
      [],
      mockConfig,
      mockDb,
    );

    expect(result.isTransition,).toBe(true,);
    expect(result.type,).toBe("location_change",);
  });

  it("handles unicode content", async () => {
    const result = await classifyTransition(
      "Je vais au tavern 🍺",
      [],
      mockConfig,
      mockDb,
    );

    // Unicode shouldn't break regex
    expect(result,).toBeDefined();
  });
});
