// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import { EMOTION_ORDINAL, EmotionType, } from "./avatar";

describe("EMOTION_ORDINAL", () => {
  test("covers every emotion with unique sequential ordinals", () => {
    const values = Object.values(EmotionType,);
    expect(Object.keys(EMOTION_ORDINAL,).sort(),).toEqual([...values,].sort(),);
    const ordinals = Object.values(EMOTION_ORDINAL,).sort((a, b,) => a - b);
    expect(ordinals,).toEqual(values.map((_, i,) => i + 1),);
  });
});
