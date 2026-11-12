// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createConfigSchema, envMap, jsonSchema, validate, } from "@/config/schema-class";
import {
  clampPromptBudget,
  PROMPT_BUDGET_BOUNDS,
  PROMPT_DEFAULTS,
  PROMPT_TOKEN_CAP_DEFAULT,
  promptMeta,
  PromptSection,
} from "@/config/sections/prompt";
import { describe, expect, test, } from "bun:test";

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
