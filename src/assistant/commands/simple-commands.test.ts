// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the lightweight registry commands: help, context, debug, detail,
 * image, music, narrate, ooc, sfx, summarize, video, impersonate/char.
 *
 * These modules register their handlers as an import side effect, so each is
 * imported for registration and resolved through the command registry.
 */
import { describe, expect, it, } from "bun:test";
import { ChatParticipantRole, } from "../../db/enums";
import "./context";
import "./debug";
import "./detail";
import "./help";
import "./image";
import "./impersonate";
import "./music";
import "./narrate";
import "./ooc";
import "./sfx";
import "./summarize";
import "./video";
import { type CommandContext, type CommandHandler, type CommandResult, getCommand, getCommandRequirement, listCommands, } from "./registry";

/** Resolve a registered handler, failing loudly when the module didn't register. */
function mustGet(name: string,): CommandHandler {
  const handler = getCommand(name,);
  if (!handler) { throw new Error(`command not registered: /${name}`); }
  return handler;
}

/** Minimal context shared by stateless commands. */
function baseCtx(overrides?: Partial<CommandContext>,): CommandContext {
  return { chatId: "chat-1", ...overrides, };
}

/** Build a message list for /summarize. */
function msgs(count: number, role = "user", content = "hello world",): CommandContext["messages"] {
  return Array.from({ length: count, }, (_, i,) => ({
    id: `m${i}`,
    role,
    content: `${content} ${i}`,
    created_at: new Date(2026, 0, 1, i,).toISOString(),
  }),);
}

describe("/help", () => {
  it("lists available commands with usage hint", () => {
    const result = mustGet("help",)([], baseCtx(),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("**Available Commands:**",);
    expect(result.systemMessage,).toContain("- `/help`",);
    expect(result.systemMessage,).toContain("Type `/<command>` to execute.",);
  });
});

describe("/context", () => {
  it("reports chat, character and message count from context", () => {
    const result = mustGet("context",)([], baseCtx({
      activeChat: { id: "chat-9", worldId: "w1", },
      currentCharacter: { id: "a1", name: "fallback", display_name: "Aria", },
      messages: msgs(3,),
    },),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Context Info:**",);
    expect(result.systemMessage,).toContain("- Chat: `chat-9`",);
    expect(result.systemMessage,).toContain("- Character: Aria",);
    expect(result.systemMessage,).toContain("- Messages loaded: 3",);
  });

  it("falls back to character name when display_name is empty", () => {
    const result = mustGet("context",)([], baseCtx({
      currentCharacter: { id: "a1", name: "Borin", display_name: "", },
    },),) as CommandResult;
    expect(result.systemMessage,).toContain("- Character: Borin",);
  });

  it("uses unknown/none placeholders for an empty context", () => {
    const result = mustGet("context",)([], baseCtx(),) as CommandResult;
    expect(result.systemMessage,).toContain("- Chat: `unknown`",);
    expect(result.systemMessage,).toContain("- Character: none",);
    expect(result.systemMessage,).toContain("- Messages loaded: 0",);
  });
});

describe("/debug", () => {
  it("emits the toggle-debug-view action and is owner-only", () => {
    const result = mustGet("debug",)([], baseCtx(),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("debug",);
    expect(result.action,).toBe("toggle-debug-view",);
    expect(getCommandRequirement("debug",),).toBe(ChatParticipantRole.Owner,);
  });
});

describe("/detail", () => {
  it.each(["immersion", "basic", "detailed",],)("accepts the %s level", (level,) => {
    const result = mustGet("detail",)([level,], baseCtx(),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("set-detail-level",);
    expect(result.actionPayload,).toEqual({ level, },);
    expect(result.systemMessage,).toBeUndefined();
  });

  it("normalizes case", () => {
    const result = mustGet("detail",)(["DETAILED",], baseCtx(),) as CommandResult;
    expect(result.actionPayload,).toEqual({ level: "detailed", },);
  });

  it.each([
    { args: [] as string[], hint: "empty", },
    { args: ["verbose"], hint: "verbose", },
    { args: [""], hint: "blank", },
  ],)("rejects $hint args with a usage hint", ({ args, },) => {
    const result = mustGet("detail",)([...args,], baseCtx(),) as CommandResult;
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /detail",);
  });
});

describe("/image", () => {
  it("returns a usage hint for empty args", () => {
    const result = mustGet("image",)([], baseCtx(),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /image <prompt>",);
  });

  it("joins args into the generation prompt", () => {
    const result = mustGet("image",)(["a", "medieval", "castle",], baseCtx(),) as CommandResult;
    expect(result.action,).toBe("generate-image",);
    expect(result.actionPayload,).toEqual({ prompt: "a medieval castle", },);
  });
});

describe("/music", () => {
  it("returns a usage hint for empty args", () => {
    const result = mustGet("music",)([], baseCtx(),) as CommandResult;
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /music <prompt>",);
  });

  it("links an external music URL instead of generating", () => {
    const url = "https://youtube.com/watch?v=abc123";
    const result = mustGet("music",)([url,], baseCtx(),) as CommandResult;
    expect(result.action,).toBe("link-music",);
    expect(result.actionPayload,).toEqual({ url, source: "external", },);
    expect(result.systemMessage,).toContain("**Music linked:**",);
  });

  it("queues generation for a text prompt", () => {
    const result = mustGet("music",)(["epic", "battle", "theme",], baseCtx(),) as CommandResult;
    expect(result.action,).toBe("generate-music",);
    expect(result.actionPayload,).toEqual({ prompt: "epic battle theme", },);
  });

  it("is registered as unavailable (hidden from listings)", () => {
    expect(listCommands(),).not.toContain("music",);
    expect(getCommand("music",),).toBeDefined();
  });
});

describe("/narrate", () => {
  it("returns a usage hint for empty args", () => {
    const result = mustGet("narrate",)([], baseCtx(),) as CommandResult;
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /narrate",);
  });

  it("injects the joined narration", () => {
    const result = mustGet("narrate",)(["The", "torch", "flickers.",], baseCtx(),) as CommandResult;
    expect(result.systemMessage,).toBe("The torch flickers.",);
    expect(result.action,).toBe("inject-narration",);
    expect(result.handled,).toBe(true,);
  });
});

describe("/ooc", () => {
  it("returns a usage hint for empty args", () => {
    const result = mustGet("ooc",)([], baseCtx(),) as CommandResult;
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /ooc",);
  });

  it("prefixes the message with (OOC)", () => {
    const result = mustGet("ooc",)(["pause", "the", "scene",], baseCtx(),) as CommandResult;
    expect(result.systemMessage,).toBe("**(OOC)** pause the scene",);
    expect(result.action,).toBe("inject-ooc",);
    expect(result.handled,).toBe(true,);
  });
});

describe("/sfx and /sound", () => {
  it.each(["sfx", "sound",],)("returns a usage hint for empty args on /%s", (name,) => {
    const result = mustGet(name,)([], baseCtx(),) as CommandResult;
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /sfx <prompt>",);
  });

  it.each(["sfx", "sound",],)("queues a sound effect via /%s", (name,) => {
    const result = mustGet(name,)(["thunder", "crash",], baseCtx(),) as CommandResult;
    expect(result.action,).toBe("generate-sfx",);
    expect(result.actionPayload,).toEqual({ prompt: "thunder crash", },);
  });

  it("registers both aliases as unavailable", () => {
    expect(listCommands(),).not.toContain("sfx",);
    expect(listCommands(),).not.toContain("sound",);
  });
});

describe("/summarize and /sum", () => {
  it("reports when there is nothing to summarize", () => {
    const result = mustGet("summarize",)([], baseCtx(),) as CommandResult;
    expect(result.systemMessage,).toBe("No messages to summarize.",);
    expect(result.action,).toBeUndefined();
  });

  it("summarizes the requested number of recent messages", () => {
    const messages = [
      ...(msgs(2, "user", "question",) ?? []),
      ...(msgs(2, "assistant", "answer",) ?? []),
      ...(msgs(1, "character", "in character",) ?? []),
      ...(msgs(1, "system", "system noise",) ?? []),
    ];
    const result = mustGet("summarize",)(["5",], baseCtx({ messages, },),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("**Conversation Summary** (last 5 messages):",);
    expect(result.systemMessage,).toContain("**User messages:** 1",);
    expect(result.systemMessage,).toContain("**AI responses:** 3",);
    expect(result.systemMessage,).toContain("- question 1",);
    expect(result.systemMessage,).toContain("- in character 0",);
    // Non-user/AI roles are ignored.
    expect(result.systemMessage,).not.toContain("system noise",);
  });

  it("falls back to 10 messages on a non-numeric count", () => {
    const messages = msgs(12,);
    const result = mustGet("sum",)(["abc",], baseCtx({ messages, },),) as CommandResult;
    expect(result.systemMessage,).toContain("(last 10 messages):",);
    // Only the last 10 of 12 are considered.
    expect(result.systemMessage,).not.toContain("hello world 1\n",);
    expect(result.systemMessage,).toContain("hello world 11",);
  });

  it("truncates long message content", () => {
    const long = "x".repeat(140,);
    const messages = [{ id: "m1", role: "user", content: long, created_at: new Date().toISOString(), },];
    const result = mustGet("summarize",)([], baseCtx({ messages, },),) as CommandResult;
    expect(result.systemMessage,).toContain("x".repeat(100,) + "...",);
    expect(result.systemMessage,).not.toContain("x".repeat(101,),);
  });

  it("caps the count at the number of available messages", () => {
    const messages = msgs(2,);
    const result = mustGet("summarize",)(["99",], baseCtx({ messages, },),) as CommandResult;
    expect(result.systemMessage,).toContain("(last 2 messages):",);
  });
});

describe("/video", () => {
  it("returns a usage hint for empty args", () => {
    const result = mustGet("video",)([], baseCtx(),) as CommandResult;
    expect(result.action,).toBeUndefined();
    expect(result.systemMessage,).toContain("Usage: /video <prompt>",);
  });

  it("queues a video generation", () => {
    const result = mustGet("video",)(["a", "dragon", "flies",], baseCtx(),) as CommandResult;
    expect(result.action,).toBe("generate-video",);
    expect(result.actionPayload,).toEqual({ prompt: "a dragon flies", },);
    expect(listCommands(),).not.toContain("video",);
  });
});

describe("/impersonate and /char", () => {
  it.each(["impersonate", "char",],)("toggles with no args on /%s", (name,) => {
    const result = mustGet(name,)([], baseCtx(),) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("impersonate-toggle",);
    expect(result.actionPayload,).toEqual({ mode: "toggle", },);
    expect(result.systemMessage,).toContain("Usage:",);
  });

  it.each(["off", "stop", "OFF",],)("stops impersonating on /%s-style arg", (arg,) => {
    const result = mustGet("impersonate",)([arg,], baseCtx(),) as CommandResult;
    expect(result.action,).toBe("impersonate-toggle",);
    expect(result.actionPayload,).toEqual({ mode: "off", },);
    expect(result.systemMessage,).toBe("Stopped impersonating.",);
  });

  it("selects a character by joined name", () => {
    const result = mustGet("impersonate",)(["Lady", "Aria",], baseCtx(),) as CommandResult;
    expect(result.action,).toBe("impersonate-select",);
    expect(result.actionPayload,).toEqual({ characterName: "Lady Aria", },);
    expect(result.systemMessage,).toContain('Impersonating as "Lady Aria"',);
  });
});
