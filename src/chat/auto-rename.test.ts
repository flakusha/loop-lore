import { describe, expect, it, } from "bun:test";
import { buildRenamePrompt, generateRuleName, } from "./auto-rename";

describe("generateRuleName", () => {
  it("generates name from character + location", () => {
    const result = generateRuleName("Gandalf", "Rivendell", null,);
    expect(result.name,).toBe("Gandalf — Rivendell",);
    expect(result.source,).toBe("auto-rule",);
  });

  it("generates name from character + topic", () => {
    const result = generateRuleName("Gandalf", null, "Tell me about the ring",);
    expect(result.name,).toContain("Gandalf",);
    expect(result.name,).toContain("ring",);
  });

  it("falls back to 'New Chat' when no info", () => {
    const result = generateRuleName("", null, null,);
    expect(result.name,).toBe("New Chat",);
  });

  it("truncates long names to 60 chars", () => {
    const longName = "A".repeat(30,);
    const longLocation = "B".repeat(30,);
    const result = generateRuleName(longName, longLocation, null,);
    expect(result.name.length,).toBeLessThanOrEqual(60,);
    expect(result.name,).toContain("…",);
  });

  it("filters out filler words from topic", () => {
    const result = generateRuleName("Char", null, "Hey, tell me about the dragon",);
    expect(result.name,).not.toContain("Hey",);
    // Topic is first 5 words after filler removal
    expect(result.name,).toContain("tell",);
  });
});

describe("buildRenamePrompt", () => {
  it("builds a prompt with character name and messages", () => {
    const prompt = buildRenamePrompt("Gandalf", [
      "Hello there",
      "I seek wisdom",
      "The journey begins",
    ],);

    expect(prompt,).toContain("Gandalf",);
    expect(prompt,).toContain("User:",);
    expect(prompt,).toContain("Gandalf:",);
    expect(prompt,).toContain("Hello there",);
    expect(prompt,).toContain("Title:",);
  });

  it("handles empty messages", () => {
    const prompt = buildRenamePrompt("Char", [],);
    expect(prompt,).toContain("Char",);
    expect(prompt,).toContain("Title:",);
  });
});
