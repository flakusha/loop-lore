// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assistant service tests — keyword response generation and the enabled flag.
 */
import { describe, expect, it, } from "bun:test";
import type { Config, } from "../config/schema";
import { generateResponse, isAssistantEnabled, } from "./service";

/** Minimal Config stub carrying only the assistant section. */
function configWith(assistant: { enabled: boolean } | undefined,): Config {
  return { assistant, } as unknown as Config;
}

describe("generateResponse", () => {
  it("matches the help keyword with word boundaries", () => {
    const response = generateResponse({ userInput: "I need help with quests", },);
    expect(response,).not.toBeNull();
    expect(response?.type,).toBe("info",);
    expect(response?.content,).toContain("/help",);
    expect(response?.confidence,).toBeGreaterThan(0,);
  });

  it("matches keywords case-insensitively", () => {
    expect(generateResponse({ userInput: "HELLO there", },)?.content,).toContain("Hello",);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(generateResponse({ userInput: "  lore  ", },)?.type,).toBe("suggestion",);
  });

  it("does not match keywords embedded in larger words", () => {
    expect(generateResponse({ userInput: "helpme please", },),).toBeNull();
    expect(generateResponse({ userInput: "shielded", },),).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(generateResponse({ userInput: "attack the darkness", },),).toBeNull();
    expect(generateResponse({ userInput: "", },),).toBeNull();
  });

  it("lets the earlier-registered keyword win on shared matches", () => {
    // "help" and "/help" both match "/help" (word boundary after "/"); the
    // first entry in RESPONSE_MAP takes precedence.
    const response = generateResponse({ userInput: "/help", },);
    expect(response?.content,).toContain("Try sending a message",);
  });

  it("ignores non-string context fields", () => {
    const response = generateResponse({
      userInput: "hello",
      chatMode: "story",
      context: { actorCount: 3, },
    },);
    expect(response?.content,).toContain("How can I help",);
  });
});

describe("isAssistantEnabled", () => {
  it("defaults to disabled when the assistant section is missing", () => {
    expect(isAssistantEnabled(configWith(undefined,),),).toBe(false,);
  });

  it("reflects the enabled flag", () => {
    expect(isAssistantEnabled(configWith({ enabled: true, },),),).toBe(true,);
    expect(isAssistantEnabled(configWith({ enabled: false, },),),).toBe(false,);
  });
});
