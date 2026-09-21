import { describe, expect, test, } from "bun:test";
import { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { enrichMessageForList, parseToolCalls, parseToolResultMeta, } from "./helpers";
import { resolveMessageContentForRender, } from "./render-message-content";

describe("parseToolCalls", () => {
  test("returns null for null/undefined/empty input", () => {
    expect(parseToolCalls(null,),).toBeNull();
    expect(parseToolCalls(undefined,),).toBeNull();
    expect(parseToolCalls("",),).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(parseToolCalls("not json",),).toBeNull();
    expect(parseToolCalls("{",),).toBeNull();
  });

  test("returns null for non-array or empty array payload", () => {
    expect(parseToolCalls('{"id":"x"}',),).toBeNull();
    expect(parseToolCalls("[]",),).toBeNull();
  });

  test("parses a single tool call", () => {
    const calls = parseToolCalls(
      JSON.stringify([{
        id: "call_1",
        type: "function",
        function: { name: "getWeather", arguments: '{"city":"Tokyo"}', },
      },],),
    );
    expect(calls,).toEqual([
      { id: "call_1", type: "function", function: { name: "getWeather", arguments: '{"city":"Tokyo"}', }, },
    ],);
  });

  test("parses multiple tool calls preserving order", () => {
    const calls = parseToolCalls(
      JSON.stringify([
        { id: "a", type: "function", function: { name: "f1", arguments: "{}", }, },
        { id: "b", type: "function", function: { name: "f2", arguments: "{}", }, },
      ],),
    );
    expect(calls,).toHaveLength(2,);
    expect(calls?.[0]?.function.name,).toBe("f1",);
    expect(calls?.[1]?.function.name,).toBe("f2",);
  });
});

describe("parseToolResultMeta", () => {
  test("returns fail-closed defaults for null/missing input", () => {
    expect(parseToolResultMeta(null,),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta(undefined,),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta("",),).toEqual({ toolName: null, toolError: false, },);
  });

  test("returns fail-closed defaults for garbage/non-object metadata", () => {
    expect(parseToolResultMeta("not json",),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta('"just a string"',),).toEqual({ toolName: null, toolError: false, },);
    expect(parseToolResultMeta("[1,2]",),).toEqual({ toolName: null, toolError: false, },);
  });

  test("parses tool_name and tool_error", () => {
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "stub_tool", tool_error: true, },),),).toEqual({
      toolName: "stub_tool",
      toolError: true,
    },);
  });

  test("empty-string name becomes null", () => {
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "", },),),).toEqual({
      toolName: null,
      toolError: false,
    },);
  });

  test("truthy non-true tool_error stays false", () => {
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "t", tool_error: 1, },),).toolError,).toBe(false,);
    expect(parseToolResultMeta(JSON.stringify({ tool_name: "t", tool_error: "true", },),).toolError,).toBe(false,);
  });
});

describe("resolveMessageContentForRender (BUG-regex-transform-runs-at-store-time-not-render-time)", () => {
  test("returns plaintext untouched when no transforms are configured", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const result = await resolveMessageContentForRender(
        db as unknown as import("kysely").Kysely<DB>,
        { content: "hello   world", content_encoding: ContentEncoding.Identity, key_id: null, chat_id: "c1", },
        [],
      );
      expect(result,).toBe("hello   world",);
    } finally {
      sqlite.close();
    }
  });

  test("applies transforms at render time on identity-encoded content", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const result = await resolveMessageContentForRender(
        db as unknown as import("kysely").Kysely<DB>,
        { content: "hello   world", content_encoding: ContentEncoding.Identity, key_id: null, chat_id: "c1", },
        [{ name: "collapse spaces", pattern: "\\s+", replacement: " ", enabled: true, },],
      );
      expect(result,).toBe("hello world",);
    } finally {
      sqlite.close();
    }
  });

  test("does not mutate the stored content (transforms are render-only)", async () => {
    // The original message shape still carries the raw text. A future
    // call with a different transform set would re-render correctly.
    const stored = { content: "AA bb CC", content_encoding: ContentEncoding.Identity, key_id: null, chat_id: "c1", };
    const { db, sqlite, } = await createTestDb();
    try {
      const lowerToX = await resolveMessageContentForRender(
        db as unknown as import("kysely").Kysely<DB>,
        stored,
        [{ name: "lower-to-X", pattern: "[a-z]+", replacement: "X", enabled: true, },],
      );
      const upperToY = await resolveMessageContentForRender(
        db as unknown as import("kysely").Kysely<DB>,
        stored,
        [{ name: "upper-to-Y", pattern: "[A-Z]+", replacement: "Y", enabled: true, },],
      );
      expect(lowerToX,).toBe("AA X CC",);
      expect(upperToY,).toBe("Y bb Y",);
      expect(stored.content,).toBe("AA bb CC",);
    } finally {
      sqlite.close();
    }
  });
});

describe("enrichMessageForList (BUG-regex-transform-runs-at-store-time-not-render-time)", () => {
  test("passes transforms through so the list endpoint mirrors the single-message route", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const result = await enrichMessageForList(
        db as unknown as import("kysely").Kysely<DB>,
        {
          content: "hello   world",
          content_encoding: ContentEncoding.Identity,
          key_id: null,
          chat_id: "c1",
        },
        [{ name: "collapse spaces", pattern: "\\s+", replacement: " ", enabled: true, },],
      );
      expect(result["content"],).toBe("hello world",);
    } finally {
      sqlite.close();
    }
  });

  test("no transforms configured → raw plaintext passthrough", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const result = await enrichMessageForList(
        db as unknown as import("kysely").Kysely<DB>,
        {
          content: "hello   world",
          content_encoding: ContentEncoding.Identity,
          key_id: null,
          chat_id: "c1",
        },
        [],
      );
      expect(result["content"],).toBe("hello   world",);
    } finally {
      sqlite.close();
    }
  });

  test("decryption failure surfaces the placeholder even with transforms configured", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      // content_encoding = gzip with no actual payload → decodeContent fails.
      const result = await enrichMessageForList(
        db as unknown as import("kysely").Kysely<DB>,
        {
          content: "not-valid-base64-or-gzip",
          content_encoding: ContentEncoding.Gzip,
          key_id: null,
          chat_id: "c1",
        },
        [{ name: "noop", pattern: "x", replacement: "y", enabled: true, },],
      );
      expect(result["content"],).toBe("[Encrypted — unable to decrypt]",);
    } finally {
      sqlite.close();
    }
  });

  test("transforms are applied to successfully-resolved plaintext content", async () => {
    // Regression guard: an earlier shape of the helper skipped the render
    // transform layer (only ran decrypt/decompress). With the fix, even a
    // raw identity-encoded row goes through applyRegexTransforms.
    const { db, sqlite, } = await createTestDb();
    try {
      const result = await enrichMessageForList(
        db as unknown as import("kysely").Kysely<DB>,
        {
          content: "hello world",
          content_encoding: ContentEncoding.Identity,
          key_id: null,
          chat_id: "c1",
        },
        [{ name: "upper", pattern: "world", replacement: "WORLD", enabled: true, },],
      );
      expect(result["content"],).toBe("hello WORLD",);
    } finally {
      sqlite.close();
    }
  });
});
