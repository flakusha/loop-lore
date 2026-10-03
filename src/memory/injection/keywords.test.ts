// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { extractMessageKeywords, } from "./keywords";

interface Case {
  name: string;
  text: string;
  max?: number;
  expected: string[];
}

const CASES: Case[] = [
  { name: "empty text", text: "", expected: [], },
  {
    name: "whitespace/punctuation only",
    text: "   !!! ??? ... ---",
    expected: [],
  },
  { name: "stopwords only", text: "The and for are but not you", expected: [], },
  {
    name: "basic extraction lowercases and drops stopwords",
    text: "The Dragon guards GOLD near the river",
    expected: ["dragon", "guards", "gold", "near", "river",],
  },
  {
    name: "drops tokens shorter than 3 chars",
    text: "I saw an ox and a cat",
    expected: ["saw", "cat",],
  },
  {
    name: "dedupes preserving first occurrence",
    text: "Dragon dragon DRAGON fire fire",
    expected: ["dragon", "fire",],
  },
  {
    name: "tokenizes on unicode punctuation and symbols",
    text: "hello,world—dragons『words』mixed123 456",
    expected: ["hello", "world", "dragons", "words", "mixed123", "456",],
  },
  {
    name: "preserves accented and non-latin letters",
    text: "Café résumé 日本語",
    expected: ["café", "résumé", "日本語",],
  },
  {
    name: "caps at custom max",
    text: "alpha beta gamma delta epsilon",
    max: 2,
    expected: ["alpha", "beta",],
  },
  {
    name: "caps at default 12",
    text: "one1 two2 three3 four4 five5 six6 seven7 eight8 nine9 ten10 eleven eleven12 thirteen13",
    expected: [
      "one1",
      "two2",
      "three3",
      "four4",
      "five5",
      "six6",
      "seven7",
      "eight8",
      "nine9",
      "ten10",
      "eleven",
      "eleven12",
    ],
  },
];

describe("extractMessageKeywords", () => {
  for (const c of CASES) {
    test(c.name, () => {
      expect(extractMessageKeywords(c.text, c.max === undefined ? {} : { max: c.max, },),).toEqual(c.expected,);
    },);
  }

  test("pure: same input yields same output", () => {
    const text = "The quick brown fox jumps";
    expect(extractMessageKeywords(text,),).toEqual(extractMessageKeywords(text,),);
  });
});
