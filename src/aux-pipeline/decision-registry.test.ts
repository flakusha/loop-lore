// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the decision question registry: vocabulary-shaped questions,
 * text-only state projection, and provider base-URL lookup.
 *
 * Resource contract: fully in-memory and parallel-safe — no DB, no files,
 * no ports, no mutated module state.
 */
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import {
  buildChoiceQuestion,
  decisionStateFromMessages,
  findDecisionBaseUrl,
  MAX_DECISION_OPTIONS,
  tryDecisionTransport,
} from "./decision-registry";

describe("buildChoiceQuestion", () => {
  test("builds a choice question from the task labels", () => {
    const q = buildChoiceQuestion("intent",);
    expect(q,).toMatchObject({
      id: "intent",
      type: "choice",
      instructions: "intent",
    },);

    expect(Object.keys(q?.type === "choice" ? q.criteria : {},).sort(),).toEqual(
      ["command", "greeting", "narrative", "question", "roleplay",],
    );
  });

  test("returns null for non-classifier tasks", () => {
    expect(buildChoiceQuestion("memory",),).toBeNull();
    expect(buildChoiceQuestion("chat-title",),).toBeNull();
  });
});

describe("decisionStateFromMessages", () => {
  test("projects roles and drops images and empties", () => {
    const state = decisionStateFromMessages([
      { role: "system", content: "sys", },
      { role: "character", content: "*waves*", },
      { role: "tool", content: "tool out", },
      { role: "user", content: "", },
    ],);

    expect(state,).toEqual([
      { role: "system", content: "sys", },
      { role: "assistant", content: "*waves*", },
      { role: "user", content: "tool out", },
    ],);
  });
});

describe("findDecisionBaseUrl", () => {
  const config = {
    generation: {
      providers: {
        openaiCompatible: [
          { name: "local-swap", baseUrl: "http://localhost:7180/v1", },
        ],
      },
    },
  } as unknown as Config;

  test("finds the provider base URL by instance name", () => {
    expect(findDecisionBaseUrl(config, "local-swap",),).toBe("http://localhost:7180/v1",);
    expect(findDecisionBaseUrl(config, "missing",),).toBeNull();
  });

  test("returns null without a generation section", () => {
    expect(findDecisionBaseUrl({} as Config, "local-swap",),).toBeNull();
  });
});

describe("tryDecisionTransport", () => {
  test("skips non-decision tasks without a provider lookup", async () => {
    expect(MAX_DECISION_OPTIONS,).toBeGreaterThan(1,);
    const result = await tryDecisionTransport({
      task: "memory",
      config: {} as Config,
      auxRole: { provider: "local-swap", model: "decision-model", },
      messages: [],
      timeoutMs: 10,
    },);

    expect(result,).toBeNull();
  });
});
