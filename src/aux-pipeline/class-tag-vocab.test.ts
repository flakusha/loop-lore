// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the shared classifier tag vocabulary helpers: validation
 * caps (non-empty, unique, length, count), subset filtering, and the
 * system_config read/write round trips.
 */
import { describe, expect, test, } from "bun:test";
import { getConfigValue, } from "../admin/config";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  activeTagsKey,
  filterActiveSubset,
  MAX_TAG_LENGTH,
  MAX_VOCABULARY_TAGS,
  readActiveTags,
  readTagVocabulary,
  validateTagVocabulary,
  writeActiveTags,
  writeTagVocabulary,
} from "./class-tag-vocab";
import { CLASSIFIER_TAG_VOCABULARY_KEY, } from "./class-template-resolver";

describe("validateTagVocabulary", () => {
  test("accepts and trims a valid list, preserving order", () => {
    const result = validateTagVocabulary([" b ", "a",],);
    expect(result,).toEqual({ ok: true, tags: ["b", "a",], },);
  });

  test("rejects non-arrays", () => {
    expect(validateTagVocabulary("x",).ok,).toBe(false,);
    expect(validateTagVocabulary(null,).ok,).toBe(false,);
  });

  test("rejects non-string entries", () => {
    expect(validateTagVocabulary(["a", 3,],).ok,).toBe(false,);
  });

  test("rejects empty entries", () => {
    expect(validateTagVocabulary(["a", "  ",],).ok,).toBe(false,);
  });

  test("rejects duplicates (after trim)", () => {
    expect(validateTagVocabulary(["a", " a ",],).ok,).toBe(false,);
  });

  test("rejects over-length entries", () => {
    expect(validateTagVocabulary(["x".repeat(MAX_TAG_LENGTH + 1,),],).ok,).toBe(false,);
    expect(validateTagVocabulary(["x".repeat(MAX_TAG_LENGTH,),],).ok,).toBe(true,);
  });

  test("rejects lists above the count cap", () => {
    const many = Array.from({ length: MAX_VOCABULARY_TAGS + 1, }, (_, i,) => `t${i}`,);
    expect(validateTagVocabulary(many,).ok,).toBe(false,);
  });
});

describe("filterActiveSubset", () => {
  test("keeps only vocabulary entries, deduplicated, order-preserving", () => {
    expect(filterActiveSubset(["b", "ghost", "a", "b",], ["a", "b",],),).toEqual(["b", "a",],);
  });
});

describe("system_config round trips", () => {
  test("writeTagVocabulary/readTagVocabulary persists and reads the list", async () => {
    const { db, } = await createTestDb();
    await writeTagVocabulary(db, ["tavern", "dungeon",],);
    expect(await readTagVocabulary(db,),).toEqual(["tavern", "dungeon",],);
    expect(await getConfigValue(db, CLASSIFIER_TAG_VOCABULARY_KEY,),).toBe(
      JSON.stringify(["tavern", "dungeon",],),
    );
  });

  test("readTagVocabulary returns [] for unset and malformed values", async () => {
    const { db, } = await createTestDb();
    expect(await readTagVocabulary(db,),).toEqual([],);

    await writeTagVocabulary(db, ["tavern",],);
    await db.updateTable("system_config",).set({ value: "not-json", },)
      .where("key", "=", CLASSIFIER_TAG_VOCABULARY_KEY,).execute();

    expect(await readTagVocabulary(db,),).toEqual([],);
  });

  test("writeActiveTags/readActiveTags persists per chat and tolerates junk", async () => {
    const { db, } = await createTestDb();
    await writeActiveTags(db, "chat-1", ["a", "b",],);
    expect(await readActiveTags(db, "chat-1",),).toEqual(["a", "b",],);
    expect(await readActiveTags(db, "chat-2",),).toEqual([],);
    expect(activeTagsKey("chat-1",),).toBe(`classifier_tags_active:chat-1`,);
  });
});
