import { beforeAll, describe, expect, test } from "bun:test";
import { createLogger } from "../logger";
import { extractMentionedActorIds, parseMentions, resolveMention } from "./mention-parser";

beforeAll(() => {
  createLogger({ level: "error" });
});

describe("Mention Parser", () => {
  describe("parseMentions()", () => {
    test("extracts single @mention", () => {
      const result = parseMentions("@Luna hello");
      expect(result).toHaveLength(1);
      expect(result[0]!.raw).toBe("@Luna hello");
      expect(result[0]!.name).toBe("Luna hello");
      expect(result[0]!.start).toBe(0);
    });

    test("extracts multiple @mentions", () => {
      const result = parseMentions("@Luna, @Max hello");
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe("Luna");
      expect(result[1]!.name).toBe("Max hello");
    });

    test("returns empty array for no mentions", () => {
      expect(parseMentions("hello world")).toEqual([]);
    });

    test("returns empty array for empty string", () => {
      expect(parseMentions("")).toEqual([]);
    });

    test("handles mention at end of text", () => {
      const result = parseMentions("hello @Luna");
      expect(result).toHaveLength(1);
      expect(result[0]!.start).toBe(6);
    });

    test("handles names with underscores and hyphens", () => {
      const result = parseMentions("@user_name-123 hi");
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("user_name-123 hi");
    });

    test("handles multi-word names", () => {
      // The regex greedily captures following words
      const result = parseMentions("@Dark Knight");
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Dark Knight");
    });

    test("does not match @ alone without a name", () => {
      const result = parseMentions("hello @ there");
      expect(result).toHaveLength(0);
    });
  });

  describe("resolveMention()", () => {
    const participants = [
      { actorId: "a1", displayName: "Luna" },
      { actorId: "a2", displayName: "Max" },
      { actorId: "a3", displayName: "Dark Knight" },
    ];

    test("resolves exact match (case-insensitive)", () => {
      expect(resolveMention("luna", participants)).toBe("a1");
      expect(resolveMention("LUNA", participants)).toBe("a1");
    });

    test("resolves prefix match", () => {
      expect(resolveMention("Lu", participants)).toBe("a1");
      expect(resolveMention("Dar", participants)).toBe("a3");
    });

    test("returns null for no match", () => {
      expect(resolveMention("Zelda", participants)).toBeNull();
    });

    test("prefers exact over prefix", () => {
      const p = [
        { actorId: "x1", displayName: "A" },
        { actorId: "x2", displayName: "AB" },
      ];
      expect(resolveMention("A", p)).toBe("x1");
    });
  });

  describe("extractMentionedActorIds()", () => {
    const participants = [
      { actorId: "a1", displayName: "Luna" },
      { actorId: "a2", displayName: "Max" },
    ];

    test("returns actor IDs for mentioned names", () => {
      const result = extractMentionedActorIds("@Luna @Max", participants);
      expect(result).toEqual(["a1", "a2"]);
    });

    test("deduplicates repeated mentions", () => {
      const result = extractMentionedActorIds("@Luna @Luna", participants);
      expect(result).toEqual(["a1"]);
    });

    test("returns empty array for no matches", () => {
      const result = extractMentionedActorIds("@Zelda hi", participants);
      expect(result).toEqual([]);
    });
  });
});
