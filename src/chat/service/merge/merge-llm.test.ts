/**
 * Tests for merge LLM prompt assembly + budget (FEA-2026-047).
 *
 * Coverage: system-prompt fallback resolution, budget allocation with
 * shared-prefix-first, hard reject when the shared prefix alone overflows,
 * head+tail truncation, prompt section labels, safe-parse shape validation.
 */
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { MergeMode, } from "./merge-criteria";
import {
  buildMergePromptMessages,
  MERGE_SYSTEM_PROMPT_FALLBACK,
  parseMergeDraft,
  planMergeBudget,
  resolveMergeSystemPrompt,
  truncateLines,
} from "./merge-llm";

describe("merge-llm", () => {
  describe("resolveMergeSystemPrompt", () => {
    test("returns the fallback when no config templates", () => {
      const config = { templates: { llm: undefined, }, } as never;
      expect(resolveMergeSystemPrompt(config,),).toBe(MERGE_SYSTEM_PROMPT_FALLBACK,);
    });

    test("returns the fallback when the template is empty", () => {
      const config = { templates: { llm: { systemPrompts: { merge: "", }, }, }, } as never;
      expect(resolveMergeSystemPrompt(config,),).toBe(MERGE_SYSTEM_PROMPT_FALLBACK,);
    });

    test("returns the config template when present", () => {
      const config = { templates: { llm: { systemPrompts: { merge: "custom merge prompt", }, }, }, } as never;
      expect(resolveMergeSystemPrompt(config,),).toBe("custom merge prompt",);
    });
  });

  describe("planMergeBudget", () => {
    test("allocates the shared prefix first, then splits the remainder", () => {
      const result = planMergeBudget({
        sharedContext: ["a", "b",],
        versions: [["x", "y",], ["p", "q",],],
        maxContextTokens: 100,
        reserveOutputTokens: 10,
      },);

      expect("ok" in result && result.ok,).toBe(true,);
      if ("ok" in result) {
        expect(result.sharedPrefix,).toBeGreaterThan(0,);
        expect(result.perSource,).toHaveLength(2,);
        expect(result.truncated,).toBe(false,);
      }
    });

    test("hard-rejects when the shared prefix alone overflows", () => {
      // 100 lines x 100 chars -> 2500 estimated tokens, budget = 90.
      const result = planMergeBudget({
        sharedContext: Array.from({ length: 100, }, () => "x".repeat(100,),),
        versions: [["a",],],
        maxContextTokens: 100,
        reserveOutputTokens: 10,
      },);

      expect("ok" in result,).toBe(false,);
      if (!("ok" in result)) {
        expect(result.code,).toBe("bad_request",);
        expect(result.message,).toContain("too large",);
      }
    });

    test("marks truncated when a version exceeds its per-source budget", () => {
      const result = planMergeBudget({
        sharedContext: ["a",],
        versions: [Array.from({ length: 50, }, () => "x".repeat(100,),),],
        maxContextTokens: 1000,
        reserveOutputTokens: 10,
      },);

      expect("ok" in result && result.ok,).toBe(true,);
      if ("ok" in result) {
        expect(result.truncated,).toBe(true,);
      }
    });

    test("hard-rejects a non-positive budget", () => {
      const result = planMergeBudget({
        sharedContext: ["a",],
        versions: [["b",],],
        maxContextTokens: 10,
        reserveOutputTokens: 10,
      },);

      expect("ok" in result,).toBe(false,);
      if (!("ok" in result)) {
        expect(result.code,).toBe("bad_request",);
      }
    });
  });

  describe("truncateLines", () => {
    test("keeps the head and drops the middle over budget", () => {
      // Each line is 100 chars -> 25 estimated tokens; budget 50 fits 2.
      const lines = Array.from({ length: 20, }, () => "x".repeat(100,),);
      const result = truncateLines(lines, 50,);
      expect(result.length,).toBeLessThan(lines.length,);
      expect(result[0],).toBe(lines[0]!,);
    });

    test("returns every line when under budget", () => {
      const lines = ["a", "b", "c",];
      expect(truncateLines(lines, 10_000,),).toEqual(lines,);
    });
  });

  describe("buildMergePromptMessages", () => {
    test("labels the shared context and both versions", () => {
      const messages = buildMergePromptMessages({
        systemPrompt: "sys",
        sharedContext: ["shared1",],
        versions: [["a1",], ["b1",],],
        mode: MergeMode.Combined,
      },);

      expect(messages,).toHaveLength(2,);
      expect(messages[0]!.role,).toBe("system",);
      expect(messages[1]!.role,).toBe("user",);
      const userContent = messages[1]!.content;
      expect(userContent,).toContain("SHARED CONTEXT",);
      expect(userContent,).toContain("VERSION A",);
      expect(userContent,).toContain("VERSION B",);
      expect(userContent,).toContain("shared1",);
      expect(userContent,).toContain("a1",);
      expect(userContent,).toContain("b1",);
    });

    test("includes the per-mode instruction block", () => {
      const messages = buildMergePromptMessages({
        systemPrompt: "sys",
        sharedContext: [],
        versions: [["a",], ["b",],],
        mode: MergeMode.FreshDiscovery,
      },);

      expect(messages[1]!.content,).toContain("REJECTED",);
    });
  });

  describe("parseMergeDraft", () => {
    test("parses a valid JSON array", () => {
      const result = parseMergeDraft(JSON.stringify([{ role: "assistant", content: "hello", },],),);
      expect("ok" in result && result.ok,).toBe(true,);
      if ("ok" in result) {
        expect(result.messages,).toEqual([{ role: "assistant", content: "hello", },],);
      }
    });

    test("rejects non-JSON", () => {
      const result = parseMergeDraft("not json",);
      expect("ok" in result,).toBe(false,);
      if (!("ok" in result)) { expect(result.code,).toBe("llm_parse",); }
    });

    test("rejects non-array JSON", () => {
      const result = parseMergeDraft('{"role":"assistant"}',);
      expect("ok" in result,).toBe(false,);
    });

    test("rejects an item missing content", () => {
      const result = parseMergeDraft('[{"role":"assistant"}]',);
      expect("ok" in result,).toBe(false,);
    });

    test("rejects an invalid role", () => {
      const result = parseMergeDraft('[{"role":"invalid","content":"x"}]',);
      expect("ok" in result,).toBe(false,);
    });

    test("rejects an empty array", () => {
      const result = parseMergeDraft("[]",);
      expect("ok" in result,).toBe(false,);
    });
  });
});
