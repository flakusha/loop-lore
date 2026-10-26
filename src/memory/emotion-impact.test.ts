// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/memory/emotion-impact.test.ts — parse/validate/weight the
// actor_memories.emotion_impact JSON column (TASK-memory-emotion-impact).

import { describe, expect, test, } from "bun:test";
import {
  effectiveImportance,
  emotionBoost,
  parseEmotionImpact,
  sanitizeEmotionImpact,
} from "./emotion-impact";

const VALID = {
  emotion: "traumatized",
  intensity: 90,
  target: "char-wolf",
  duration: "permanent",
  triggers_coping: true,
} as const;

describe("sanitizeEmotionImpact", () => {
  test("accepts a well-formed impact and maps snake_case optionals", () => {
    const impact = sanitizeEmotionImpact(VALID,);
    expect(impact,).toEqual({
      emotion: "traumatized",
      intensity: 90,
      duration: "permanent",
      target: "char-wolf",
      triggersCoping: true,
    },);
  });

  test("normalizes neutral to none", () => {
    expect(sanitizeEmotionImpact({ emotion: "neutral", intensity: 50, duration: "momentary", },),).toBeUndefined();
  });

  test("rejects unknown emotions, out-of-range intensity, and unknown durations", () => {
    expect(sanitizeEmotionImpact({ ...VALID, emotion: "furious", },),).toBeUndefined();
    expect(sanitizeEmotionImpact({ ...VALID, intensity: 101, },),).toBeUndefined();
    expect(sanitizeEmotionImpact({ ...VALID, intensity: -1, },),).toBeUndefined();
    expect(sanitizeEmotionImpact({ ...VALID, duration: "forever", },),).toBeUndefined();
    expect(sanitizeEmotionImpact({ ...VALID, intensity: "high", },),).toBeUndefined();
    expect(sanitizeEmotionImpact("traumatized",),).toBeUndefined();
    expect(sanitizeEmotionImpact(null,),).toBeUndefined();
  });

  test("drops malformed optional fields but keeps the core", () => {
    const impact = sanitizeEmotionImpact({ ...VALID, target: 42, decay_rate: -5, triggers_coping: "yes", },);
    expect(impact,).toEqual({ emotion: "traumatized", intensity: 90, duration: "permanent", },);
  });
});

describe("parseEmotionImpact", () => {
  test("parses the stored JSON column", () => {
    expect(parseEmotionImpact(JSON.stringify(VALID,),),).toEqual({
      emotion: "traumatized",
      intensity: 90,
      duration: "permanent",
      target: "char-wolf",
      triggersCoping: true,
    },);
  });

  test("returns undefined for null, empty, and malformed columns", () => {
    expect(parseEmotionImpact(null,),).toBeUndefined();
    expect(parseEmotionImpact(undefined,),).toBeUndefined();
    expect(parseEmotionImpact("",),).toBeUndefined();
    expect(parseEmotionImpact("not json",),).toBeUndefined();
    expect(parseEmotionImpact("{emotion:}",),).toBeUndefined();
  });
});

describe("emotion weighting", () => {
  test("boost scales with duration weight and intensity", () => {
    expect(emotionBoost(undefined,),).toBe(0,);
    expect(emotionBoost({ emotion: "happy", intensity: 50, duration: "momentary", },),).toBeCloseTo(0.025,);
    expect(emotionBoost({ emotion: "grudge", intensity: 50, duration: "lasting", },),).toBeCloseTo(0.075,);
    expect(emotionBoost({ emotion: "traumatized", intensity: 100, duration: "permanent", },),).toBeCloseTo(0.3,);
  });

  test("effectiveImportance lifts equal-importance emotional memories and caps at 1", () => {
    expect(effectiveImportance({ importance: 0.6, },),).toBe(0.6,);
    expect(
      effectiveImportance({
        importance: 0.6,
        emotionImpact: { emotion: "grudge", intensity: 80, duration: "lasting", },
      },),
    ).toBeCloseTo(0.72,);

    expect(
      effectiveImportance({
        importance: 0.95,
        emotionImpact: { emotion: "traumatized", intensity: 100, duration: "permanent", },
      },),
    ).toBe(1,);
  });
});
