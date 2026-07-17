import { describe, test, expect } from "bun:test";
import { filter, containsProfanity } from "./service";

describe("Profanity Filter", () => {
  describe("filter()", () => {
    test("replaces profanity with asterisks", () => {
      const result = filter("fuck you");
      expect(result).not.toBe("fuck you");
      expect(result).toMatch(/\*+\syou/);
    });

    test("handles multiple profane words", () => {
      const result = filter("fuck shit");
      expect(result).not.toBe("fuck shit");
      expect(result).toMatch(/\*+\s\*+/);
    });

    test("returns clean text unchanged", () => {
      const text = "hello world";
      expect(filter(text)).toBe(text);
    });

    test("handles empty string", () => {
      expect(filter("")).toBe("");
    });

    test("preserves surrounding text", () => {
      const result = filter("you are fuck amazing");
      expect(result).not.toBe("you are fuck amazing");
      expect(result).toMatch(/^you are \*+ amazing$/);
    });
  });

  describe("containsProfanity()", () => {
    test("returns true for profane text", () => {
      expect(containsProfanity("fuck you")).toBe(true);
    });

    test("returns false for clean text", () => {
      expect(containsProfanity("hello world")).toBe(false);
    });

    test("returns false for empty string", () => {
      expect(containsProfanity("")).toBe(false);
    });

    test("detects profanity case-insensitively", () => {
      expect(containsProfanity("FUCK")).toBe(true);
    });
  });
});
