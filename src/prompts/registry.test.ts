// src/prompts/registry.test.ts — Tests for the LLM text template registry

import { describe, expect, test, } from "bun:test";
import type { LlmTemplateConfig, } from "../config/sections/templates";
import { PROMPT_PURPOSES, } from "./purposes";
import {
  GM_SYSTEM_PROMPT,
  LLM_PROMPT_DEFAULTS,
  NSFW_POLICY_PROMPT,
  resolveSystemPrompt,
} from "./registry";

function llmTemplates(systemPrompts: Record<string, string>,): LlmTemplateConfig {
  return {
    merge: "extend",
    systemPrompts: {
      chat: "chat",
      summarize: "summarize",
      imagePrompt: "imagePrompt",
      ooc: "ooc",
      ...systemPrompts,
    },
    chatFormats: {},
  };
}

describe("LLM_PROMPT_DEFAULTS", () => {
  test("purpose union exactly matches the defaults keys", () => {
    for (const purpose of PROMPT_PURPOSES) {
      expect(LLM_PROMPT_DEFAULTS[purpose], `${purpose} default missing`,).toBeTruthy();
    }
    // Every default key must be a typed purpose — no orphaned keys.
    expect(Object.keys(LLM_PROMPT_DEFAULTS,).sort((a, b,) => a.localeCompare(b,)),).toEqual(
      [...PROMPT_PURPOSES,].sort((a, b,) => a.localeCompare(b,)),
    );
  });

  test("assistant default equals the seeded assistant prompt", () => {
    expect(LLM_PROMPT_DEFAULTS.assistant,).toContain("Loop Lore's Assistant",);
  });

  test("gm default equals the exported constant", () => {
    expect(LLM_PROMPT_DEFAULTS.gm,).toBe(GM_SYSTEM_PROMPT,);
  });

  test("nsfw default is a JSON classifier", () => {
    expect(NSFW_POLICY_PROMPT,).toContain("content rating classifier",);
    expect(LLM_PROMPT_DEFAULTS.nsfw,).toBe(NSFW_POLICY_PROMPT,);
  });
});

describe("resolveSystemPrompt", () => {
  test("falls back to code default when config has no override", () => {
    expect(resolveSystemPrompt(undefined, "gm",),).toBe(GM_SYSTEM_PROMPT,);
    expect(resolveSystemPrompt(llmTemplates({},), "gm",),).toBe(GM_SYSTEM_PROMPT,);
  });

  test("config override wins over code default", () => {
    const custom = "You are a custom GM.";
    const config = llmTemplates({ gm: custom, },);
    expect(resolveSystemPrompt(config, "gm",),).toBe(custom,);
  });

  test("custom (new) purpose keys resolve from config", () => {
    const custom = "You are a detective.";
    const config = llmTemplates({ detective: custom, },);
    expect(resolveSystemPrompt(config, "detective",),).toBe(custom,);
  });

  test("empty-string override is treated as unset (code default wins)", () => {
    const config = llmTemplates({ gm: "", },);
    expect(resolveSystemPrompt(config, "gm",),).toBe(GM_SYSTEM_PROMPT,);
  });

  test("unknown purpose with no override returns empty string", () => {
    expect(resolveSystemPrompt(undefined, "does-not-exist",),).toBe("",);
  });

  test("replace-merge config still resolves through defaults for missing keys", () => {
    // merge: replace wipes built-ins, so config only has the keys the user set.
    const config: LlmTemplateConfig = {
      merge: "replace",
      systemPrompts: {
        chat: "custom chat",
        summarize: "s",
        imagePrompt: "i",
        ooc: "o",
      },
      chatFormats: {},
    };
    expect(resolveSystemPrompt(config, "chat",),).toBe("custom chat",);
    expect(resolveSystemPrompt(config, "gm",),).toBe(GM_SYSTEM_PROMPT,);
  });
});
