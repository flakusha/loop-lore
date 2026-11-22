// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Pure unit tests for the shared request-time preflight. No I/O, no DB. */
import { describe, expect, test, } from "bun:test";
import { preflightRequest, } from "./preflight";

/** A sound API-format graph: loader → sink. */
const VALID_GRAPH = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors", }, },
  "2": { class_type: "SaveImage", inputs: { images: ["1", 0,], }, },
};

/** A config validateLoRAConfig accepts. */
const VALID_LORA = { name: "detail_lora", strength: 0.5, backend: "comfyui", };

describe("preflightRequest", () => {
  test("is a no-op when the caller supplies no structured fields", () => {
    expect(preflightRequest({},),).toEqual({ ok: true, },);
  });

  test("accepts a sound graph and LoRA config together", () => {
    expect(preflightRequest({ workflow: VALID_GRAPH, lora: VALID_LORA, },),).toEqual({ ok: true, },);
  });

  test("rejects a malformed graph and reports the validator's issues", () => {
    const result = preflightRequest({ workflow: {}, },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.field,).toBe("workflow",);
      expect(result.error,).toContain("Invalid workflow graph:",);
    }
  });

  test("rejects a cyclic graph", () => {
    const result = preflightRequest({
      workflow: {
        a: { class_type: "KSampler", inputs: { model: ["b", 0,], }, },
        b: { class_type: "KSampler", inputs: { model: ["a", 0,], }, },
      },
    },);

    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.error,).toContain("cycle detected",); }
  });

  test("reports null / non-object payloads as failures, not throws", () => {
    expect(preflightRequest({ workflow: null, },).ok,).toBe(false,);
    expect(preflightRequest({ workflow: "not-a-graph", },).ok,).toBe(false,);
  });

  test("rejects an invalid LoRA config with the validator's message", () => {
    const result = preflightRequest({ lora: { name: "", strength: 0.5, backend: "comfyui", }, },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.field,).toBe("lora",);
      expect(result.error,).toBe("Invalid LoRA name",);
    }
  });

  test("checks the graph before the LoRA config", () => {
    const result = preflightRequest({
      workflow: {},
      lora: { name: "", strength: 0.5, backend: "comfyui", },
    },);

    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.field,).toBe("workflow",); }
  });

  test("accepts sound parsed LoRA string entries", () => {
    expect(preflightRequest({ loraEntries: [{ path: "a.safetensors", strength: 0.6, },], },),).toEqual({ ok: true, },);
  });

  test("accepts an empty loraEntries array as a no-op", () => {
    expect(preflightRequest({ loraEntries: [], },),).toEqual({ ok: true, },);
  });

  test("rejects an entry with an empty path", () => {
    const result = preflightRequest({ loraEntries: [{ path: "", strength: 0.5, },], },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.field,).toBe("loras",);
      expect(result.error,).toContain("path must be a non-empty string",);
    }
  });

  test("rejects out-of-range strength with the shared bounds", () => {
    for (const strength of [0, 5, -1, Number.NaN, Number.POSITIVE_INFINITY,]) {
      const result = preflightRequest({ loraEntries: [{ path: "a.safetensors", strength, },], },);
      expect(result.ok,).toBe(false,);
      if (!result.ok) {
        expect(result.field,).toBe("loras",);
        expect(result.error,).toContain("must be between 0.1 and 1",);
      }
    }
  });

  test("reports the first failing entry position", () => {
    const result = preflightRequest({
      loraEntries: [{ path: "good.safetensors", strength: 0.5, }, { path: "bad.safetensors", strength: 2, },],
    },);

    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.error,).toContain("position 1",); }
  });

  test("checks the structured lora config before loraEntries", () => {
    const result = preflightRequest({
      lora: { name: "", strength: 0.5, backend: "comfyui", },
      loraEntries: [{ path: "a.safetensors", strength: 5, },],
    },);

    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.field,).toBe("lora",); }
  });
});
