// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for chat/service/vn-question-parse.ts — `vn_questions` row coercion.
 *
 * `QUESTION_COLUMNS` is asserted against the real migrated table (a typo there
 * throws at query time, a dropped column silently loses data), and
 * `parseVnQuestion` against the fallbacks the routes depend on: a malformed
 * JSON column must not throw and must not invent data.
 */
import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { parseVnQuestion, QUESTION_COLUMNS, } from "./vn-question-parse";

type RawRow = Parameters<typeof parseVnQuestion>[0];

/** A row with every column distinct, so a lost column cannot hide. */
function row(overrides: Partial<RawRow> = {},): RawRow {
  return {
    id: "q1",
    chat_id: "chat-1",
    scene_index: 3,
    question_type: "lore",
    question_text: "Who opened the door?",
    speaker_id: "Ada",
    options: JSON.stringify([
      { id: "o1", text: "I did", emotion_modifier: 5, relationship_modifier: 10, },
    ],),
    next_scene_id: "scene-9",
    consequences: JSON.stringify({ location: "loc-1", },),
    relationship_impact: JSON.stringify({ ada: 10, },),
    mood_impact: JSON.stringify({ wary: 5, },),
    status: "available",
    selected_option_id: null,
    answered_at: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("QUESTION_COLUMNS", () => {
  test("every column exists on the migrated vn_questions table", async () => {
    const { db, sqlite, } = await createTestDb();
    const info = sqlite.prepare("PRAGMA table_info(vn_questions)",).all() as Array<{ name: string }>;
    const actual = info.map((c,) => c.name);

    for (const column of QUESTION_COLUMNS) {
      expect(actual,).toContain(column,);
    }

    await db.destroy();
  });

  test("selecting exactly these columns preserves every persisted value", async () => {
    const { db, } = await createTestDb();
    const ownerId = await insertUsers(db, "parse-owner", "Owner", {} as never,);
    const chatId = await insertChats(db, "Parse cols", ownerId, {
      type: "group",
      mode: "vn",
    } as never,);

    await db.insertInto("vn_questions",).values({
      id: "q-cols",
      chat_id: chatId,
      scene_index: 7,
      question_type: "social",
      question_text: "Keep this text",
      speaker_id: "Kai",
      options: JSON.stringify([{ id: "o1", text: "Yes", relationship_modifier: 4, },],),
      next_scene_id: "scene-42",
      consequences: JSON.stringify({ location: "loc-7", },),
      relationship_impact: JSON.stringify({ kai: 3, },),
      mood_impact: JSON.stringify({ tense: 2, },),
      status: "available",
      created_at: "2024-02-02T00:00:00Z",
    } as never,).execute();

    const selected = await db
      .selectFrom("vn_questions",)
      .select([...QUESTION_COLUMNS,],)
      .where("id", "=", "q-cols",)
      .executeTakeFirstOrThrow();

    // A column missing from the projection arrives undefined here, which
    // would then surface as a dropped field on the parsed question.
    expect(Object.keys(selected,).sort(),).toEqual([...QUESTION_COLUMNS,].sort(),);

    const parsed = parseVnQuestion(selected,);
    expect(parsed.scene_index,).toBe(7,);
    expect(parsed.question_type,).toBe("social",);
    expect(parsed.speaker_id,).toBe("Kai",);
    expect(parsed.next_scene_id,).toBe("scene-42",);
    expect(parsed.consequences,).toEqual({ location: "loc-7", },);
    expect(parsed.relationship_impact,).toEqual({ kai: 3, },);
    expect(parsed.mood_impact,).toEqual({ tense: 2, },);
    expect(parsed.created_at,).toBe("2024-02-02T00:00:00Z",);

    await db.destroy();
  });
});

describe("parseVnQuestion", () => {
  test("malformed JSON columns fall back to empty containers, never throw", () => {
    const parsed = parseVnQuestion(row({
      options: "{not json",
      consequences: "]]",
      relationship_impact: "nope",
      mood_impact: "<",
    },),);

    expect(parsed.options,).toEqual([],);
    expect(parsed.consequences,).toEqual({},);
    expect(parsed.relationship_impact,).toEqual({},);
    expect(parsed.mood_impact,).toEqual({},);
    // Untouched scalar columns survive the fallback.
    expect(parsed.question_text,).toBe("Who opened the door?",);
  });

  test("a non-array options column yields no options", () => {
    const notAnArray = JSON.stringify({ o1: {}, },);
    const parsed = parseVnQuestion(row({ options: notAnArray, },),);
    expect(parsed.options,).toEqual([],);
  });

  test("options without a usable string id are dropped, not rendered blank", () => {
    const parsed = parseVnQuestion(row({
      options: JSON.stringify([
        { id: "keep", text: "Kept", },
        { id: 42, text: "Numeric id", },
        { id: "", text: "Empty id", },
        { text: "No id at all", },
        null,
        "string option",
      ],),
    },),);

    expect(parsed.options.map((o,) => o.id),).toEqual(["keep",],);
  });

  test("partial options are completed with the documented defaults", () => {
    const [option,] = parseVnQuestion(row({
      options: JSON.stringify([{ id: "o1", },],),
    },),).options;

    expect(option!.text,).toBe("",);
    expect(option!.emotion_modifier,).toBe(0,);
    expect(option!.relationship_modifier,).toBe(0,);
    expect(option!.next_scene_id,).toBeNull();
    expect(option!.consequence,).toBeNull();
  });

  test("a full option carries its consequence, next scene, and modifiers", () => {
    const [option,] = parseVnQuestion(row({
      options: JSON.stringify([
        {
          id: "o1",
          text: "Go with her",
          emotion_modifier: -3,
          relationship_modifier: 12,
          next_scene_id: "scene-13",
          consequence: { location: "loc-42", },
        },
      ],),
    },),).options;

    expect(option!,).toEqual({
      id: "o1",
      text: "Go with her",
      emotion_modifier: -3,
      relationship_modifier: 12,
      next_scene_id: "scene-13",
      consequence: { location: "loc-42", },
    },);
  });

  test("scalar columns pass through unchanged", () => {
    const parsed = parseVnQuestion(row({
      status: "answered",
      selected_option_id: "o1",
      answered_at: "2024-03-03T00:00:00Z",
      speaker_id: null,
    },),);

    expect(parsed.status,).toBe("answered",);
    expect(parsed.selected_option_id,).toBe("o1",);
    expect(parsed.answered_at,).toBe("2024-03-03T00:00:00Z",);
    expect(parsed.speaker_id,).toBeNull();
  });
});
