/**
 * Tests for intent detection & routing (src/assistant/intent.ts).
 *
 * Pure rule engine: detectIntent routes on slash commands and keyword
 * patterns; isApprovedTool/getApiPolicy index allowlists; and
 * detectAvatarChangeIntent does substring matching against a config.
 */
import { describe, expect, test, } from "bun:test";
import type { AvatarTemplateConfig, } from "../config/sections/templates";
import {
  APPROVED_TOOLS,
  detectAvatarChangeIntent,
  detectIntent,
  getApiPolicy,
  isApprovedTool,
} from "./intent";

describe("detectIntent — slash commands", () => {
  test("routes an approved slash command to tool_exec", () => {
    const result = detectIntent("/roll 2d6",);
    expect(result.intent,).toBe("tool_exec",);
    expect(result.target,).toBe("roll",);
    expect(result.requires_approval,).toBe(false,);
  });

  test("is case-insensitive and trims surrounding whitespace", () => {
    const result = detectIntent("  /IMPROVE this text  ",);
    expect(result.intent,).toBe("tool_exec",);
    expect(result.target,).toBe("improve",);
  });

  test("routes an UNKNOWN slash command to chat", () => {
    const result = detectIntent("/definitely-not-a-command hello",);
    expect(result.intent,).toBe("chat",);
    expect(result.target,).toBe("chat",);
  });

  test("routes every APPROVED_TOOLS command to tool_exec", () => {
    for (const tool of Object.keys(APPROVED_TOOLS,)) {
      expect(detectIntent(`/${tool}`,).intent,).toBe("tool_exec",);
    }
  });
});

describe("detectIntent — keyword patterns", () => {
  test("routes a character generation request to generate", () => {
    const result = detectIntent("please create a character for me",);
    expect(result.intent,).toBe("generate",);
    expect(result.target,).toBe("character",);
    expect(result.requires_approval,).toBe(true,);
  });

  test("routes an item generation request to generate/item", () => {
    const result = detectIntent("make a new item for my inventory",);
    expect(result.intent,).toBe("generate",);
    expect(result.target,).toBe("item",);
  });

  test("routes dice-roll wording to tool_exec/roll", () => {
    const result = detectIntent("roll the dice",);
    expect(result.intent,).toBe("tool_exec",);
    expect(result.target,).toBe("roll",);
  });

  test("routes web search wording to api_call/search", () => {
    const result = detectIntent("search the web for magic items",);
    expect(result.intent,).toBe("api_call",);
    expect(result.target,).toBe("search",);
  });

  test("routes summarize wording to tool_exec/summarize", () => {
    const result = detectIntent("can you summarize the session?",);
    expect(result.intent,).toBe("tool_exec",);
    expect(result.target,).toBe("summarize",);
  });
});

describe("detectIntent — default chat", () => {
  test("falls back to chat for ordinary messages", () => {
    const result = detectIntent("good morning, how are you?",);
    expect(result.intent,).toBe("chat",);
    expect(result.target,).toBe("chat",);
    expect(result.confidence,).toBeCloseTo(0.3,);
  });

  test("handles an empty string", () => {
    const result = detectIntent("",);
    expect(result.intent,).toBe("chat",);
  });
});

describe("isApprovedTool", () => {
  test("returns true for approved tools", () => {
    expect(isApprovedTool("roll",),).toBe(true,);
    expect(isApprovedTool("summarize",),).toBe(true,);
  });

  test("returns false for unknown tools", () => {
    expect(isApprovedTool("destroy",),).toBe(false,);
    expect(isApprovedTool("",),).toBe(false,);
  });
});

describe("getApiPolicy", () => {
  test("returns undefined for APIs without a policy", () => {
    expect(getApiPolicy("missing",),).toBeUndefined();
  });
});

describe("detectAvatarChangeIntent", () => {
  const config: AvatarTemplateConfig = {
    merge: "replace",
    emotions: {},
    intentPatterns: [
      { pattern: "smile", emotion: "happy", },
      { pattern: "frown", emotion: "sad", },
    ],
  };

  test("returns the matching emotion for a contained pattern", () => {
    expect(detectAvatarChangeIntent("she smiles warmly", config,),).toBe("happy",);
    expect(detectAvatarChangeIntent("he began to frown", config,),).toBe("sad",);
  });

  test("matches case-insensitively", () => {
    expect(detectAvatarChangeIntent("SHE SMILES AT ME", config,),).toBe("happy",);
  });

  test("returns null when no pattern matches", () => {
    expect(detectAvatarChangeIntent("he walks away", config,),).toBeNull();
  });

  test("returns the first matching emotion in config order", () => {
    const ordered: AvatarTemplateConfig = {
      merge: "replace",
      emotions: {},
      intentPatterns: [
        { pattern: "smile", emotion: "happy", },
        { pattern: "smile bright", emotion: "joyful", },
      ],
    };
    expect(detectAvatarChangeIntent("a bright smile", ordered,),).toBe("happy",);
  });
});
