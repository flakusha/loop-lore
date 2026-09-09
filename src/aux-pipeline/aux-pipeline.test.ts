// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../db/index";
import type { DB, } from "../db/schema";
import {
  callAux,
  GM_TOOL_DETECTION_PROMPT,
  INTENT_CLASSIFIER_PROMPT,
  MEMORY_EXTRACTION_PROMPT,
  NSFW_POLICY_LEVELS_PROMPT,
  NSFW_POLICY_PROMPT,
  TRANSITION_CLASSIFIER_PROMPT,
} from "./index";
import type { AuxCallOptions, AuxCallResult, AuxTaskName, } from "./types";

// ── prompt exports ────────────────────────────────────────────

describe("aux-pipeline prompts", () => {
  const PROMPTS: Array<{ name: string; val: string }> = [
    { name: "GM_TOOL_DETECTION_PROMPT", val: GM_TOOL_DETECTION_PROMPT, },
    { name: "INTENT_CLASSIFIER_PROMPT", val: INTENT_CLASSIFIER_PROMPT, },
    { name: "MEMORY_EXTRACTION_PROMPT", val: MEMORY_EXTRACTION_PROMPT, },
    { name: "NSFW_POLICY_LEVELS_PROMPT", val: NSFW_POLICY_LEVELS_PROMPT, },
    { name: "NSFW_POLICY_PROMPT", val: NSFW_POLICY_PROMPT, },
    { name: "TRANSITION_CLASSIFIER_PROMPT", val: TRANSITION_CLASSIFIER_PROMPT, },
  ];

  for (const p of PROMPTS) {
    test(`${p.name} is a non-empty string`, () => {
      expect(p.val,).toBeString();
      expect(p.val.length,).toBeGreaterThan(0,);
    });
  }

  test("all prompts are distinct", () => {
    const vals = PROMPTS.map((p,) => p.val);
    const seen: string[] = [];
    for (const v of vals) {
      if (!seen.includes(v,)) { seen.push(v,); }
    }
    expect(seen.length,).toBe(vals.length,);
  });
});

// ── types ────────────────────────────────────────────────────

describe("aux-pipeline types", () => {
  test("AuxTaskName covers all five known tasks", () => {
    const tasks: AuxTaskName[] = ["transition", "intent", "memory", "nsfw", "gm-tool",];
    expect(tasks.length,).toBe(5,);
  });

  test("AuxCallOptions partial shape", () => {
    const opts: AuxCallOptions = {};
    expect(opts.role,).toBeUndefined();
    expect(opts.timeoutMs,).toBeUndefined();
    expect(opts.userId,).toBeUndefined();
  });

  test("AuxCallResult complete shape", () => {
    const r: AuxCallResult = {
      content: "x",
      model: "m",
      provider: "p",
      latencyMs: 1,
      promptTokens: 0,
      completionTokens: 0,
    };
    expect(r.content,).toBe("x",);
    expect(r.latencyMs,).toBeGreaterThanOrEqual(0,);
  });
});

// ── callAux graceful degradation ─────────────────────────────

describe("callAux graceful failure", () => {
  test("returns null when no model role is resolved", async () => {
    // Minimal in-memory DB + empty config: resolveModelRole returns null.
    // BUG-1: if resolveModelRole throws instead, this test fails and documents the regression.
    const sqlite = new Database(":memory:",);
    const dialect = createSqliteDialect(sqlite,);
    const db = new Kysely<DB>({ dialect, },);
    const config = {} as Parameters<typeof callAux>[1];
    const result = await callAux(
      "transition",
      config,
      db,
      [{ role: "user", content: "ping", },],
    );
    expect(result,).toBeNull();
    await db.destroy();
  });
});
