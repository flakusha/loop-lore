// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import {
  clearKeyphraseRecallCooldowns,
  DEFAULT_MAX_KEYPHRASE_RECALLS,
  findKeyphraseMatches,
  keyphraseRecallAllowed,
  matchesKeyphrase,
  recordKeyphraseRecall,
} from "./keyphrase-recall";

afterEach(() => {
  clearKeyphraseRecallCooldowns();
},);

describe("matchesKeyphrase", () => {
  test("case-insensitive substring match", () => {
    expect(matchesKeyphrase("The MOONSTONE relic glows.", "moonstone",),).toBe(true,);
    expect(matchesKeyphrase("nothing here", "moonstone",),).toBe(false,);
  });

  test("multi-word keyphrases match as phrases", () => {
    expect(matchesKeyphrase("we met at the old Harbor Inn", "old harbor inn",),).toBe(true,);
    expect(matchesKeyphrase("we met at the inn", "old harbor inn",),).toBe(false,);
  });

  test("empty/whitespace keyphrase never matches", () => {
    expect(matchesKeyphrase("anything", "",),).toBe(false,);
    expect(matchesKeyphrase("anything", "   ",),).toBe(false,);
  });
});

describe("findKeyphraseMatches", () => {
  const entries = [
    { id: "m1", keywords: ["moonstone",], },
    { id: "m2", keywords: ["harbor inn",], },
    { id: "m3", keywords: [], },
    { id: "m4", keywords: ["MOONSTONE", "lantern",], },
  ];

  test("no match → no hits", () => {
    expect(findKeyphraseMatches({ text: "plain text", entries, },),).toEqual([],);
  });

  test("matches are capped at the per-message limit (default 3)", () => {
    const wide = [
      { id: "a", keywords: ["tok",], },
      { id: "b", keywords: ["tok",], },
      { id: "c", keywords: ["tok",], },
      { id: "d", keywords: ["tok",], },
    ];
    const hits = findKeyphraseMatches({ text: "tok tok tok tok", entries: wide, },);
    expect(hits,).toHaveLength(DEFAULT_MAX_KEYPHRASE_RECALLS,);
    expect(hits.map((h,) => h.id),).toEqual(["a", "b", "c",],);
  });

  test("honors an explicit limit and a limit of 0", () => {
    // "moonstone" matches m1 and m4 — limit 1 keeps only the first hit.
    expect(findKeyphraseMatches({ text: "moonstone", entries, maxMatches: 1, },).map((h,) => h.id),).toEqual(["m1",],);
    expect(findKeyphraseMatches({ text: "moonstone", entries, maxMatches: 0, },),).toEqual([],);
  });
});

describe("keyphrase cooldown", () => {
  test("allowed before recording, blocked inside the TTL, allowed after it", () => {
    const opts = { chatId: "c1", memoryId: "m1", now: 1_000, ttlMs: 100, } as const;
    expect(keyphraseRecallAllowed(opts,),).toBe(true,);
    recordKeyphraseRecall(opts,);
    expect(keyphraseRecallAllowed({ ...opts, now: 1_050, },),).toBe(false,);
    expect(keyphraseRecallAllowed({ ...opts, now: 1_100, },),).toBe(true,);
  });

  test("cooldown is scoped per chat and per memory", () => {
    recordKeyphraseRecall({ chatId: "c1", memoryId: "m1", now: 1_000, ttlMs: 100, },);
    expect(keyphraseRecallAllowed({ chatId: "c2", memoryId: "m1", now: 1_001, ttlMs: 100, },),).toBe(true,);
    expect(keyphraseRecallAllowed({ chatId: "c1", memoryId: "m2", now: 1_001, ttlMs: 100, },),).toBe(true,);
  });

  test("clearKeyphraseRecallCooldowns resets state", () => {
    recordKeyphraseRecall({ chatId: "c1", memoryId: "m1", now: 1_000, ttlMs: 100, },);
    clearKeyphraseRecallCooldowns();
    expect(keyphraseRecallAllowed({ chatId: "c1", memoryId: "m1", now: 1_001, ttlMs: 100, },),).toBe(true,);
  });
});
