// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { isChainPayloadShape, validateChainPayload, } from "./chain-types";

const VALID = {
  kind: "chain",
  steps: [
    { id: "s1", templateId: "txt2img", params: { steps: 20, seed: -1, name: "a", }, },
    { id: "s2", templateId: "upscale", params: { factor: 2, tiled: false, }, },
  ],
};

describe("validateChainPayload", () => {
  test("accepts and normalizes a valid chain", () => {
    const result = validateChainPayload(VALID,);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.payload.kind,).toBe("chain",);
    expect(result.payload.steps,).toHaveLength(2,);
    expect(result.payload.steps[0]!.params.steps,).toBe(20,);
  });

  test("rejects non-object payloads", () => {
    expect(validateChainPayload("nope",).ok,).toBe(false,);
    expect(validateChainPayload(null,).ok,).toBe(false,);
    expect(validateChainPayload([],).ok,).toBe(false,);
  });

  test("rejects payloads without kind/steps", () => {
    const result = validateChainPayload({ kind: "chain", },);
    expect(result.ok,).toBe(false,);
    const other = validateChainPayload({ steps: [], },);
    expect(other.ok,).toBe(false,);
  });

  test("rejects a step without an id", () => {
    const result = validateChainPayload({
      kind: "chain",
      steps: [{ id: "", templateId: "t", params: {}, },],
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.errors.join("; ",),).toContain("non-empty id",);
  });

  test("rejects duplicate step ids", () => {
    const result = validateChainPayload({
      kind: "chain",
      steps: [
        { id: "s1", templateId: "t1", params: {}, },
        { id: "s1", templateId: "t2", params: {}, },
      ],
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.errors.join("; ",),).toContain("duplicate step id s1",);
  });

  test("rejects a step without a templateId", () => {
    const result = validateChainPayload({
      kind: "chain",
      steps: [{ id: "s1", templateId: "", params: {}, },],
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.errors.join("; ",),).toContain("non-empty templateId",);
  });

  test("rejects non-object and non-primitive params", () => {
    const arrayParams = validateChainPayload({
      kind: "chain",
      steps: [{ id: "s1", templateId: "t", params: [1, 2,], },],
    },);
    expect(arrayParams.ok,).toBe(false,);

    const nestedValue = validateChainPayload({
      kind: "chain",
      steps: [{ id: "s1", templateId: "t", params: { deep: { n: 1, }, }, },],
    },);
    expect(nestedValue.ok,).toBe(false,);
    if (nestedValue.ok) { return; }
    expect(nestedValue.errors.join("; ",),).toContain("param deep",);
  });

  test("collects every step error at once", () => {
    const result = validateChainPayload({
      kind: "chain",
      steps: [
        { id: "", templateId: "", params: {}, },
        "not-an-object",
      ],
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.errors.length,).toBeGreaterThanOrEqual(2,);
  });
});

describe("isChainPayloadShape", () => {
  test("probes kind + steps only", () => {
    expect(isChainPayloadShape({ kind: "chain", steps: [], },),).toBe(true,);
    expect(isChainPayloadShape({ kind: "chain", },),).toBe(false,);
    expect(isChainPayloadShape({ kind: "other", steps: [], },),).toBe(false,);
    expect(isChainPayloadShape({ steps: "x", kind: "chain", },),).toBe(false,);
  });
});
