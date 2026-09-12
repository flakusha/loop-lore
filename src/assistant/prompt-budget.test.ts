// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for prompt token-budget trimming and message reordering.
 *
 * `dropOverBudgetSections` drops lowest-priority sections first, never
 * drops priority-0 sections, and keeps messages 1:1 with kept sections.
 * `compactPromptHistory` is local (extractive summary, no LLM).
 */
import { describe, expect, test, } from "bun:test";
import type { GenerationMessage, } from "../generation/gen-types-options";
import {
  compactPromptHistory,
  dropOverBudgetSections,
  reorderPromptMessages,
} from "./prompt-budget";
import type { PromptSectionReport, } from "./prompt/types";

function msg(role: GenerationMessage["role"], content: string,): GenerationMessage {
  return { role, content, };
}

function section(name: string, tokens: number, dropped = false,): PromptSectionReport {
  return { name, chars: tokens * 4, tokens, dropped, };
}

// Mutates `dropped` flags in place; returns the updated total.
describe("dropOverBudgetSections", () => {
  test("drops lowest priority first until under budget", () => {
    const sections = [
      section("system", 100,),
      section("lore", 50,),
      section("memories", 100,),
      section("postHistory", 80,),
      section("examples", 200,),
    ];
    // Total 530, budget 300: drop examples (330 still over) then postHistory.
    const remaining = dropOverBudgetSections(sections, 300, 530,);
    expect(remaining,).toBe(250,);
    expect(sections.map((s,) => s.dropped),).toEqual([false, false, false, true, true,],);
  });

  test("priority-0 sections are never dropped, even over budget", () => {
    const sections = [section("system", 500,),];
    const remaining = dropOverBudgetSections(sections, 10, 500,);
    expect(remaining,).toBe(500,);
    expect(sections[0]?.dropped,).toBe(false,);
  });

  test("unknown names are immune (undefined priority fails the > 0 gate)", () => {
    const sections = [section("mystery", 400,), section("lore", 50,),];
    const remaining = dropOverBudgetSections(sections, 100, 450,);
    expect(sections[0]?.dropped,).toBe(false,);
    expect(sections[1]?.dropped,).toBe(true,);
    expect(remaining,).toBe(400,);
  });

  test("pre-dropped sections are skipped", () => {
    const sections = [section("examples", 200, true,), section("lore", 50,),];
    const remaining = dropOverBudgetSections(sections, 100, 50,);
    expect(remaining,).toBe(50,);
    expect(sections.map((s,) => s.dropped),).toEqual([true, false,],);
  });

  test("under budget keeps everything", () => {
    const sections = [section("system", 10,), section("lore", 20,),];
    const remaining = dropOverBudgetSections(sections, 100, 30,);
    expect(remaining,).toBe(30,);
    expect(sections.map((s,) => s.dropped),).toEqual([false, false,],);
  });
});

describe("reorderPromptMessages", () => {
  test("dropped sections remove their message; systems move front in order", () => {
    const messages = [msg("user", "u1",), msg("system", "s1",), msg("system", "s2",),];
    const sections = [section("chatHistory", 10,), section("system", 10,), section("lore", 10,),];
    const out = reorderPromptMessages(messages, sections,);
    expect(out.map((m,) => m.content),).toEqual(["s1", "s2", "u1",],);
  });

  test("dropped tail message is removed", () => {
    const messages = [msg("system", "s",), msg("user", "gone",),];
    const sections = [section("system", 10,), section("examples", 10, true,),];
    const out = reorderPromptMessages(messages, sections,);
    expect(out.map((m,) => m.content),).toEqual(["s",],);
  });
});

describe("compactPromptHistory", () => {
  test("under budget returns undefined and leaves messages alone", async () => {
    const messages = [msg("user", "hi",), msg("assistant", "hello",),];
    const summary = await compactPromptHistory(messages, 10000,);
    expect(summary,).toBeUndefined();
    expect(messages.length,).toBe(2,);
  });

  test("over budget replaces older messages with a system summary", async () => {
    const original = Array.from({ length: 12, }, (_, i,) => msg("user", `m${i} ${"x".repeat(500,)}`,),);
    const messages = [...original,];
    const summary = await compactPromptHistory(messages, 100,);
    expect(summary,).toBeDefined();
    // Summary + last 10 kept.
    expect(messages.length,).toBe(11,);
    expect(messages[0]?.role,).toBe("system",);
    expect(messages[10]?.content,).toBe(original[11]?.content,);
    expect(summary,).toContain("m0",);
  });
});
