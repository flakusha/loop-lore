import { describe, expect, test, } from "bun:test";
import { type AssistantIntent, INTENT_PATTERNS, REGEX_SPECIAL_CHARS, SLASH_COMMAND, } from "./intent";

// ── Helper ────────────────────────────────────────────────

/** Approved tools (mirrors assistant/intent.ts APPROVED_TOOLS) */
const APPROVED_TOOLS: Record<string, boolean> = {
  roll: true,
  summarize: true,
  improve: true,
  impersonate: true,
  narrate: true,
  help: true,
};

function matchIntent(
  text: string,
): { intent: AssistantIntent; target: string; confidence: number } | null {
  const trimmed = text.trim().toLowerCase();

  // Check slash commands first (mirrors original detectIntent logic)
  if (trimmed.startsWith("/",)) {
    const slashMatch = SLASH_COMMAND.exec(trimmed,);
    if (slashMatch) {
      const cmd = slashMatch[1];
      if (cmd && APPROVED_TOOLS[cmd]) {
        return { intent: "tool_exec", target: cmd, confidence: 0.95, };
      }
      // Unknown slash command → chat (not pattern-matched)
      return null;
    }
  }

  let best: { intent: AssistantIntent; target: string; confidence: number } | null = null;

  for (const { intent, target, confidence, patterns, } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed,)) {
        if (!best || confidence > best.confidence) {
          best = { intent, target, confidence, };
        }
        break;
      }
    }
  }

  return best;
}

// ── Generate Intents ──────────────────────────────────────

describe("generate: character", () => {
  const cases = [
    "Create a character for my RPG",
    "Generate a new character named Aldric",
    "Make a character",
    "I want a new character",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("generate",);
      expect(result?.target,).toBe("character",);
    });
  }
});

describe("generate: item", () => {
  const cases = [
    "Create a magic item",
    "Generate a new item",
    "Make an item called Excalibur",
    "Craft a legendary item",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("generate",);
      expect(result?.target,).toBe("item",);
    });
  }
});

describe("generate: location", () => {
  const cases = [
    "Create a location for the tavern",
    "Generate a new location",
    "Make a dungeon location",
    "I need a world location",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("generate",);
      expect(result?.target,).toBe("location",);
    });
  }
});

describe("generate: world", () => {
  const cases = [
    "Create a world",
    "Generate a fantasy world",
    "Make a new world",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("generate",);
      expect(result?.target,).toBe("world",);
    });
  }
});

describe("generate: image", () => {
  const cases = [
    "Generate an image of the castle",
    "Create an image",
    "Draw a portrait for me",
    "Make a picture of the dragon",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("generate",);
      expect(result?.target,).toBe("image",);
    });
  }
});

describe("generate: quest", () => {
  const cases = [
    "Create a quest to find the artifact",
    "Generate a new quest",
    "Make a quest",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("generate",);
      expect(result?.target,).toBe("quest",);
    });
  }
});

// ── Tool Exec Intents ─────────────────────────────────────

describe("tool_exec: roll", () => {
  const cases = [
    "Roll the dice",
    "I need to roll 2d6",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("tool_exec",);
      expect(result?.target,).toBe("roll",);
    });
  }

  test("/roll matches via slash command", () => {
    const result = matchIntent("/roll",);
    expect(result?.intent,).toBe("tool_exec",);
    expect(result?.target,).toBe("roll",);
  });
});

describe("tool_exec: summarize", () => {
  const cases = [
    "Summarize our conversation",
    "Give me a summary",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("tool_exec",);
      expect(result?.target,).toBe("summarize",);
    });
  }

  test("/summarize matches via slash command", () => {
    const result = matchIntent("/summarize",);
    expect(result?.intent,).toBe("tool_exec",);
    expect(result?.target,).toBe("summarize",);
  });
});

describe("tool_exec: improve", () => {
  const cases = [
    "Improve this text",
    "Rewrite the last paragraph",
    "Make it better text quality",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("tool_exec",);
      expect(result?.target,).toBe("improve",);
    });
  }

  test("/improve matches via slash command", () => {
    const result = matchIntent("/improve",);
    expect(result?.intent,).toBe("tool_exec",);
    expect(result?.target,).toBe("improve",);
  });
});

// ── API Call Intents ──────────────────────────────────────

describe("api_call: search", () => {
  const cases = [
    "Search the web for medieval armor",
    "Look up dragons",
    "Find info about swords",
    "Research magic systems",
  ];

  for (const input of cases) {
    test(`matches "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result?.intent,).toBe("api_call",);
      expect(result?.target,).toBe("search",);
    });
  }
});

// ── Negative Cases ────────────────────────────────────────

describe("no match (falls through to chat)", () => {
  const cases = [
    "Hello there",
    "What's the weather like?",
    "Tell me a story about dragons",
    "I walk to the tavern",
  ];

  for (const input of cases) {
    test(`does not match "${input}"`, () => {
      const result = matchIntent(input,);
      expect(result,).toBeNull();
    });
  }
});

// ── Slash Command Pattern ─────────────────────────────────

describe("SLASH_COMMAND", () => {
  test("matches /roll", () => {
    const m = SLASH_COMMAND.exec("/roll",);
    expect(m?.[1],).toBe("roll",);
  });

  test("matches /summarize", () => {
    const m = SLASH_COMMAND.exec("/summarize",);
    expect(m?.[1],).toBe("summarize",);
  });

  test("does not match plain text", () => {
    expect(SLASH_COMMAND.exec("hello",),).toBeNull();
  });

  test("does not match empty string", () => {
    expect(SLASH_COMMAND.exec("",),).toBeNull();
  });
});

// ── Regex Special Chars ───────────────────────────────────

describe("REGEX_SPECIAL_CHARS", () => {
  test("matches special regex characters individually", () => {
    // Reset lastIndex since regex has g flag
    REGEX_SPECIAL_CHARS.lastIndex = 0;
    expect(REGEX_SPECIAL_CHARS.test(".",),).toBe(true,);
    REGEX_SPECIAL_CHARS.lastIndex = 0;
    expect(REGEX_SPECIAL_CHARS.test("*",),).toBe(true,);
    REGEX_SPECIAL_CHARS.lastIndex = 0;
    expect(REGEX_SPECIAL_CHARS.test("+",),).toBe(true,);
    REGEX_SPECIAL_CHARS.lastIndex = 0;
    expect(REGEX_SPECIAL_CHARS.test("?",),).toBe(true,);
  });

  test("does not match normal characters", () => {
    REGEX_SPECIAL_CHARS.lastIndex = 0;
    expect(REGEX_SPECIAL_CHARS.test("a",),).toBe(false,);
    REGEX_SPECIAL_CHARS.lastIndex = 0;
    expect(REGEX_SPECIAL_CHARS.test("1",),).toBe(false,);
  });
});

// ── Structure ─────────────────────────────────────────────

describe("INTENT_PATTERNS structure", () => {
  test("has 10 pattern groups", () => {
    expect(INTENT_PATTERNS.length,).toBe(10,);
  });

  test("every group has at least 1 pattern", () => {
    for (const { patterns, } of INTENT_PATTERNS) {
      expect(patterns.length,).toBeGreaterThanOrEqual(1,);
    }
  });

  test("all patterns are RegExp instances", () => {
    for (const { patterns, } of INTENT_PATTERNS) {
      for (const p of patterns) {
        expect(p,).toBeInstanceOf(RegExp,);
      }
    }
  });

  test("generate intents require approval", () => {
    const generateIntents = INTENT_PATTERNS.filter((p,) => p.intent === "generate");
    for (const { requires_approval, } of generateIntents) {
      expect(requires_approval,).toBe(true,);
    }
  });

  test("tool_exec intents do not require approval", () => {
    const toolIntents = INTENT_PATTERNS.filter((p,) => p.intent === "tool_exec");
    for (const { requires_approval, } of toolIntents) {
      expect(requires_approval,).toBe(false,);
    }
  });
});
