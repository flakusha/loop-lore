// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for chat/service/vn-free-text.ts — the shared typed-answer contract
 * used by both custom entry points (typed question answers and typed
 * branching choices).
 */
import { describe, expect, test, } from "bun:test";
import {
  CUSTOM_VN_ID_PREFIX,
  newCustomVnId,
  resolveVnAnswerOption,
  resolveVnFreeText,
  VN_FREE_TEXT_MAX_LENGTH,
} from "./vn-free-text";
import type { VnQuestionOption, } from "./vn-questions-types";

describe("resolveVnFreeText", () => {
  test("accepts a plain string, trimmed", () => {
    expect(resolveVnFreeText("  I ask about the door  ",),).toEqual({
      ok: true,
      text: "I ask about the door",
    },);
  });

  test("keeps tab, newline and carriage return", () => {
    expect(resolveVnFreeText("line one\nline two",),).toEqual({
      ok: true,
      text: "line one\nline two",
    },);
  });

  test("strips C0 control characters and DEL", () => {
    expect(resolveVnFreeText("a\u0000b\u0007c\u001B[31m\u007F",),).toEqual({
      ok: true,
      text: "abc[31m",
    },);
  });

  test("rejects non-strings", () => {
    expect(resolveVnFreeText(42,).ok,).toBe(false,);
    expect(resolveVnFreeText(null,).ok,).toBe(false,);
    expect(resolveVnFreeText(undefined,).ok,).toBe(false,);
  });

  test("rejects whitespace-only input", () => {
    expect(resolveVnFreeText("   \n\t ",).ok,).toBe(false,);
  });

  test("rejects input that is only control characters", () => {
    expect(resolveVnFreeText("\u0000\u0007",).ok,).toBe(false,);
  });

  test("accepts text at the cap and rejects one over", () => {
    const atCap = "a".repeat(VN_FREE_TEXT_MAX_LENGTH,);
    expect(resolveVnFreeText(atCap,).ok,).toBe(true,);

    const over = resolveVnFreeText(`${atCap}b`,);
    expect(over.ok,).toBe(false,);
    if (!over.ok) {
      expect(over.message,).toContain("2000",);
    }
  });
});

describe("newCustomVnId", () => {
  test("mints unique custom- prefixed ids", () => {
    const a = newCustomVnId();
    const b = newCustomVnId();
    expect(a.startsWith(CUSTOM_VN_ID_PREFIX,),).toBe(true,);
    expect(a,).not.toBe(b,);
  });
});

describe("resolveVnAnswerOption", () => {
  const options: VnQuestionOption[] = [
    {
      id: "o1",
      text: "Open it",
      emotion_modifier: 0,
      relationship_modifier: 0,
      next_scene_id: null,
      consequence: null,
    },
  ];

  test("resolves a picked option with no custom option", () => {
    const result = resolveVnAnswerOption(options, "o1", undefined,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.option.id,).toBe("o1",);
      expect(result.customOption,).toBeNull();
    }
  });

  test("synthesizes a zero-modifier custom option from free text", () => {
    const result = resolveVnAnswerOption(options, undefined, "I lie to her",);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.option.id.startsWith(CUSTOM_VN_ID_PREFIX,),).toBe(true,);
      expect(result.option.text,).toBe("I lie to her",);
      expect(result.option.provenance,).toBe("custom",);
      expect(result.option.emotion_modifier,).toBe(0,);
      expect(result.option.relationship_modifier,).toBe(0,);
      expect(result.option.next_scene_id,).toBeNull();
      expect(result.option.consequence,).toBeNull();
      expect(result.customOption,).toBe(result.option,);
    }
  });

  test("rejects both channels at once", () => {
    expect(resolveVnAnswerOption(options, "o1", "typed too",).ok,).toBe(false,);
  });

  test("rejects neither channel", () => {
    expect(resolveVnAnswerOption(options, undefined, undefined,).ok,).toBe(false,);
  });

  test("treats an empty-string optionId as no channel", () => {
    expect(resolveVnAnswerOption(options, "", undefined,).ok,).toBe(false,);
  });

  test("rejects an unknown optionId", () => {
    expect(resolveVnAnswerOption(options, "nope", undefined,).ok,).toBe(false,);
  });

  test("surfaces the resolver's rejection message for bad free text", () => {
    const result = resolveVnAnswerOption(options, undefined, "   ",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.message,).toContain("empty",);
    }
  });
});
