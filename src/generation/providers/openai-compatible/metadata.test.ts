// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { modelInfoFromOpenAi, } from "./metadata";

describe("modelInfoFromOpenAi", () => {
  test("maps an empty entry to a bare info with empty id", () => {
    const raw: Record<string, unknown> = {};
    const info = modelInfoFromOpenAi(raw,);
    expect(info.id,).toBe("",);
    expect(info.raw,).toBe(raw,);
    expect(info.ownedBy,).toBeUndefined();
    expect(info.contextWindow,).toBeUndefined();
    expect(info.paramSize,).toBeUndefined();
  });

  test("falls back to empty id when id is not a string", () => {
    const info = modelInfoFromOpenAi({ id: 42, },);
    expect(info.id,).toBe("",);
  });

  test("carries provider-reported fields and derives param size", () => {
    const info = modelInfoFromOpenAi({
      id: "llama-3.1-70B",
      owned_by: "meta",
      context_length: 131072,
      max_output: 4096,
      thinking: true,
      tool_calling: false,
      modalities: ["text", "image",],
    },);
    expect(info.id,).toBe("llama-3.1-70B",);
    expect(info.ownedBy,).toBe("meta",);
    expect(info.contextWindow,).toBe(131072,);
    expect(info.maxOutput,).toBe(4096,);
    expect(info.thinking,).toBe(true,);
    expect(info.toolCalling,).toBe(false,);
    expect(info.modalities,).toEqual(["text", "image",],);
    expect(info.paramSize,).toBe("70B",);
  });

  test("reads camelCase ownedBy and compacts spaced param sizes", () => {
    const info = modelInfoFromOpenAi({ id: "qwen-7 B", ownedBy: "qwen", },);
    expect(info.ownedBy,).toBe("qwen",);
    expect(info.paramSize,).toBe("7B",);
  });

  test("ignores non-string owned_by and non-array modalities", () => {
    const info = modelInfoFromOpenAi({
      id: "plain-model",
      owned_by: 7,
      modalities: "text",
      context_length: "big",
    },);
    expect(info.ownedBy,).toBeUndefined();
    expect(info.modalities,).toBeUndefined();
    expect(info.contextWindow,).toBeUndefined();
    expect(info.paramSize,).toBeUndefined();
  });

  test("leaves models without a size token without paramSize", () => {
    const info = modelInfoFromOpenAi({ id: "gpt-4o-mini", },);
    expect(info.paramSize,).toBeUndefined();
  });
});
