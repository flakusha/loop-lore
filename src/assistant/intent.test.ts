/**
 * Tests for avatar change intent detection (src/assistant/intent.ts).
 *
 * detectAvatarChangeIntent maps a user message to an emotion using
 * config-defined keyword patterns. The former rule-based request classifier
 * (detectIntent/isApprovedTool/getApiPolicy) was superseded by LLM
 * `classifyIntent` and removed.
 */
import { describe, expect, test, } from "bun:test";
import type { AvatarTemplateConfig, } from "../config/sections/templates";
import { detectAvatarChangeIntent, } from "./intent";

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

  test("skips empty and whitespace-only patterns", () => {
    // An empty pattern is a substring of every message; matching it would pin
    // the avatar to that emotion for the whole session.
    const withEmpty: AvatarTemplateConfig = {
      merge: "replace",
      emotions: {},
      intentPatterns: [
        { pattern: "", emotion: "blank", },
        { pattern: "   ", emotion: "spaces", },
        { pattern: "smile", emotion: "happy", },
      ],
    };

    expect(detectAvatarChangeIntent("he walks away", withEmpty,),).toBeNull();
    expect(detectAvatarChangeIntent("she smiles", withEmpty,),).toBe("happy",);
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
