// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createConfigSchema, envMap, jsonSchema, validate, } from "../schema-class";
import {
  clampPromptBudget,
  clampPromptRatio,
  effectivePromptBudget,
  PROMPT_BUDGET_BOUNDS,
  PROMPT_DEFAULTS,
  PROMPT_RATIO_BOUNDS,
  PROMPT_RATIO_DEFAULT,
  PROMPT_TOKEN_CAP_DEFAULT,
  promptMeta,
  PromptSection,
} from "./prompt";

describe("PromptSection", () => {
  test("defaults keep the historical 1024-token caps", () => {
    const prompt = new PromptSection();
    expect(prompt.loreTokenBudget,).toBe(PROMPT_TOKEN_CAP_DEFAULT,);
    expect(prompt.memoryTokenBudget,).toBe(PROMPT_TOKEN_CAP_DEFAULT,);
    expect(PROMPT_DEFAULTS.loreTokenBudget,).toBe(1024,);
  });

  test("constructor clamps overrides into bounds", () => {
    expect(new PromptSection({ loreTokenBudget: 10, },).loreTokenBudget,).toBe(PROMPT_BUDGET_BOUNDS.min,);
    expect(new PromptSection({ loreTokenBudget: 1_000_000, },).loreTokenBudget,).toBe(PROMPT_BUDGET_BOUNDS.max,);
    expect(new PromptSection({ memoryTokenBudget: -5, },).memoryTokenBudget,).toBe(PROMPT_BUDGET_BOUNDS.min,);
  });

  test("in-bounds overrides pass through", () => {
    const prompt = new PromptSection({ loreTokenBudget: 2048, memoryTokenBudget: 256, },);
    expect(prompt.loreTokenBudget,).toBe(2048,);
    expect(prompt.memoryTokenBudget,).toBe(256,);
  });

  test("clampPromptBudget falls back to the default on non-finite values", () => {
    expect(clampPromptBudget(undefined,),).toBe(PROMPT_TOKEN_CAP_DEFAULT,);
    expect(clampPromptBudget(null,),).toBe(PROMPT_TOKEN_CAP_DEFAULT,);
    expect(clampPromptBudget(Number.NaN,),).toBe(PROMPT_TOKEN_CAP_DEFAULT,);
    expect(clampPromptBudget(256.9,),).toBe(256,);
  });
});

describe("per-world context-share ratio (theme-4 AC5)", () => {
  test("neutral ratio keeps the configured budget", () => {
    expect(effectivePromptBudget(1024, 1,),).toBe(1024,);
    expect(effectivePromptBudget(1024, undefined,),).toBe(1024,);
    expect(effectivePromptBudget(1024, null,),).toBe(1024,);
  });

  test("ratio scales the budget within the global ceiling", () => {
    expect(effectivePromptBudget(1024, 0.5,),).toBe(512,);
    expect(effectivePromptBudget(1024, 2,),).toBe(2048,);
  });

  test("ratio of 0 clamps to the ratio floor, never to zero tokens", () => {
    expect(clampPromptRatio(0,),).toBe(PROMPT_RATIO_BOUNDS.min,);
    expect(effectivePromptBudget(1024, 0,),).toBe(Math.floor(1024 * PROMPT_RATIO_BOUNDS.min,),);
  });

  test("negative ratios clamp to the ratio floor", () => {
    expect(clampPromptRatio(-1,),).toBe(PROMPT_RATIO_BOUNDS.min,);
    expect(effectivePromptBudget(1024, -10,),).toBe(Math.floor(1024 * PROMPT_RATIO_BOUNDS.min,),);
  });

  test("ratios above the max clamp, and the budget ceiling still holds", () => {
    expect(clampPromptRatio(8,),).toBe(PROMPT_RATIO_BOUNDS.max,);
    // 1024 * 4 stays in bounds…
    expect(effectivePromptBudget(1024, 8,),).toBe(4096,);
    // …but a huge ratio can never exceed PROMPT_BUDGET_BOUNDS.max.
    expect(effectivePromptBudget(8192, 1e9,),).toBe(PROMPT_BUDGET_BOUNDS.max,);
    expect(effectivePromptBudget(4096, 100,),).toBe(PROMPT_BUDGET_BOUNDS.max,);
  });

  test("non-finite ratios fall back to neutral", () => {
    expect(clampPromptRatio(Number.NaN,),).toBe(PROMPT_RATIO_DEFAULT,);
    expect(clampPromptRatio(Number.POSITIVE_INFINITY,),).toBe(PROMPT_RATIO_DEFAULT,);
    expect(effectivePromptBudget(1024, Number.NaN,),).toBe(1024,);
  });

  test("fractional products floor back into integer token budgets", () => {
    expect(effectivePromptBudget(1024, 0.25,),).toBe(256,);
    expect(effectivePromptBudget(1000, 0.5,),).toBe(500,);
    expect(effectivePromptBudget(1023, 0.3,),).toBe(Math.floor(1023 * 0.3,),);
  });

  test("scale-then-clamp: the unconfigured base still respects the ratio", () => {
    // Base undefined → historical default 1024, then scaled + clamped.
    expect(effectivePromptBudget(undefined, 2,),).toBe(2048,);
  });
});

describe("prompt config integration", () => {
  test("defaults validate and register env vars + json schema", () => {
    const config = createConfigSchema().defaults;
    expect(() => validate(config,)).not.toThrow();
    expect(config.prompt.loreTokenBudget,).toBe(1024,);

    expect(envMap().PROMPT_LORETOKENBUDGET,).toBe("prompt.loreTokenBudget",);
    expect(envMap().PROMPT_MEMORYTOKENBUDGET,).toBe("prompt.memoryTokenBudget",);

    const schema = jsonSchema();
    expect(schema.properties,).toHaveProperty("prompt",);
  });

  test("out-of-bounds budgets fail load-time validation", () => {
    const config = createConfigSchema().defaults;
    const broken = structuredClone(config,) as typeof config;
    broken.prompt.loreTokenBudget = 10;
    expect(() => validate(broken,)).toThrow(/prompt\.loreTokenBudget/,);

    const brokenMemory = structuredClone(config,) as typeof config;
    brokenMemory.prompt.memoryTokenBudget = PROMPT_BUDGET_BOUNDS.max + 1;
    expect(() => validate(brokenMemory,)).toThrow(/prompt\.memoryTokenBudget/,);
  });

  test("promptMeta documents both budgets", () => {
    expect(promptMeta.properties.loreTokenBudget.default,).toBe(1024,);
    expect(promptMeta.properties.memoryTokenBudget.default,).toBe(1024,);
    expect(promptMeta.required,).toEqual(["loreTokenBudget", "memoryTokenBudget",],);
  });
});
