// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for keyword parsing and recent-conversation word extraction.
 *
 * Pure parsers run without a DB; the conversation helpers run against a
 * real test DB to prove the confirmed+visible filter and scan-depth limit.
 */
import { describe, expect, test, } from "bun:test";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../db/enums";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  parseKeyGroups,
  parseKeywords,
  recentConversation,
  recentUserWords,
} from "./keywords";

describe("parseKeywords", () => {
  test("nullish and non-string input yields []", () => {
    expect(parseKeywords(null,),).toEqual([],);
    expect(parseKeywords(undefined,),).toEqual([],);
    expect(parseKeywords(42,),).toEqual([],);
  });

  test("arrays are stringified", () => {
    expect(parseKeywords(["a", 1,],),).toEqual(["a", "1",],);
  });

  test("JSON arrays parse", () => {
    expect(parseKeywords('["x", "y"]',),).toEqual(["x", "y",],);
  });

  test("CSV splits, trims, drops empties", () => {
    expect(parseKeywords("a, b,, c ",),).toEqual(["a", "b", "c",],);
    expect(parseKeywords("  ",),).toEqual([],);
  });

  test("invalid JSON falls back to CSV on the raw string", () => {
    expect(parseKeywords("[oops",),).toEqual(["[oops",],);
  });
});

describe("parseKeyGroups", () => {
  test("nullish and non-JSON input yields null", () => {
    expect(parseKeyGroups(null,),).toBeNull();
    expect(parseKeyGroups(undefined,),).toBeNull();
    expect(parseKeyGroups("not json",),).toBeNull();
    expect(parseKeyGroups('{"a":1}',),).toBeNull();
  });

  test("normalizes nested groups, skips non-arrays and empties", () => {
    expect(parseKeyGroups('[["a"," b "],["", "c"], "skip", [], ["d"]]',),).toEqual([
      ["a", "b",],
      ["c",],
      ["d",],
    ],);
  });

  test("all-empty groups yield null", () => {
    expect(parseKeyGroups('[["", " "]]',),).toBeNull();
    expect(parseKeyGroups("[]",),).toBeNull();
  });

  test("direct array input works", () => {
    expect(parseKeyGroups([["x",],],),).toEqual([["x",],],);
  });
});

describe("recentConversation", () => {
  async function seed() {
    const { db, } = await createTestDb();
    await insertUsers(db, "kw-user", "Kw User", { id: "kw-user", },);
    await insertActors(db, "Speaker", { id: "kw-actor", } as never,);
    await insertChats(db, "Kw Chat", "kw-user", { id: "kw-chat", },);
    const opts = { status: MessageStatus.Confirmed, visibility: MessageVisibility.Visible, };
    await insertMessages(db, "kw-chat", "kw-actor", MessageRole.User, "The dragon guards gold.", {
      ...opts,
      created_at: "2026-01-01T00:00:01.000Z",
    },);
    await insertMessages(db, "kw-chat", "kw-actor", MessageRole.Assistant, "I bow deeply.", {
      ...opts,
      created_at: "2026-01-01T00:00:02.000Z",
    },);
    await insertMessages(db, "kw-chat", "kw-actor", MessageRole.User, "We need swords.", {
      ...opts,
      created_at: "2026-01-01T00:00:03.000Z",
    },);
    await insertMessages(db, "kw-chat", "kw-actor", MessageRole.User, "Secret hidden plans.", {
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.HiddenByUser,
      created_at: "2026-01-01T00:00:04.000Z",
    },);
    return { db, };
  }

  test("includes only confirmed+visible user messages", async () => {
    const { db, } = await seed();
    try {
      const { words, text, } = await recentConversation(db, "kw-chat", 10,);
      expect(text,).toContain("dragon guards gold",);
      expect(text,).toContain("need swords",);
      expect(text,).not.toContain("bow deeply",);
      expect(text,).not.toContain("Secret hidden",);
      expect(words.has("dragon",),).toBe(true,);
      expect(words.has("swords",),).toBe(true,);
      expect(words.has("secret",),).toBe(false,);
    } finally {
      await db.destroy();
    }
  });

  test("scanDepth limits to the newest user messages", async () => {
    const { db, } = await seed();
    try {
      const { text, } = await recentConversation(db, "kw-chat", 1,);
      expect(text,).toContain("need swords",);
      expect(text,).not.toContain("dragon guards gold",);
    } finally {
      await db.destroy();
    }
  });

  test("recentUserWords covers only the single most recent user message", async () => {
    const { db, } = await seed();
    try {
      const words = await recentUserWords(db, "kw-chat",);
      expect(words.has("swords",),).toBe(true,);
      expect(words.has("dragon",),).toBe(false,);
    } finally {
      await db.destroy();
    }
  });

  test("empty chat yields empty words and text", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "kw-empty", "Kw Empty", { id: "kw-empty", },);
    await insertChats(db, "Empty Chat", "kw-empty", { id: "kw-empty-chat", },);
    try {
      const { words, text, } = await recentConversation(db, "kw-empty-chat", 10,);
      expect(words.size,).toBe(0,);
      expect(text,).toBe("",);
    } finally {
      await db.destroy();
    }
  });
});
