// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { validateGraph, } from "./graph-validate";

/** A sound API-format graph: loader → sampler → sink. */
const VALID = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors", }, },
  "2": {
    class_type: "KSampler",
    inputs: { model: ["1", 0,], images: ["1", 1,], seed: 42, },
  },
  "3": { class_type: "SaveImage", inputs: { images: ["2", 0,], }, },
};

function kinds(result: ReturnType<typeof validateGraph>,): string[] {
  return result.issues.map((issue,) => issue.kind);
}

describe("validateGraph", () => {
  test("accepts a sound API-format record", () => {
    const result = validateGraph(VALID,);
    expect(result.ok,).toBe(true,);
    expect(result.issues,).toEqual([],);
  });

  test("reports a cycle", () => {
    const result = validateGraph({
      a: { class_type: "KSampler", inputs: { model: ["b", 0,], }, },
      b: { class_type: "KSampler", inputs: { model: ["a", 0,], }, },
    },);
    expect(result.ok,).toBe(false,);
    expect(kinds(result,),).toContain("cycle",);
    expect(result.issues.find((issue,) => issue.kind === "cycle")?.message,).toContain("a, b",);
  });

  test("reports an input linking to a missing node", () => {
    const result = validateGraph({
      "2": { class_type: "KSampler", inputs: { model: ["99", 0,], }, },
      "3": { class_type: "SaveImage", inputs: { images: ["2", 0,], }, },
    },);
    expect(result.ok,).toBe(false,);
    expect(kinds(result,),).toContain("missing_input",);
    expect(result.issues.some((issue,) => issue.message.includes("unknown node 99",)),).toBe(true,);
  });

  test("reports duplicate ids in the node-array form", () => {
    const result = validateGraph([
      { id: "1", class_type: "CheckpointLoaderSimple", inputs: {}, },
      { id: "1", class_type: "KSampler", inputs: {}, },
    ],);
    expect(result.ok,).toBe(false,);
    expect(kinds(result,),).toContain("duplicate_id",);
  });

  test("reports a node with no inputs object as missing input", () => {
    const result = validateGraph({
      "1": { class_type: "KSampler", },
      "3": { class_type: "SaveImage", inputs: { images: ["1", 0,], }, },
    },);
    expect(result.ok,).toBe(false,);
    expect(result.issues.some((issue,) => issue.message.includes("missing inputs",)),).toBe(true,);
  });

  test("rejects dead non-sink nodes but allows terminal sinks", () => {
    const result = validateGraph({
      "1": { class_type: "CheckpointLoaderSimple", inputs: {}, },
      "2": { class_type: "KSampler", inputs: { model: ["1", 0,], }, },
      "3": { class_type: "SaveImage", inputs: { images: ["2", 0,], }, },
      // Nothing links FROM the preview — a PreviewImage sink is legitimate.
      "4": { class_type: "PreviewImage", inputs: { images: ["2", 0,], }, },
      // Nothing links FROM the rogue node and it is not a sink — dead.
      "5": { class_type: "KSampler", inputs: {}, },
    },);
    expect(result.ok,).toBe(false,);
    expect(kinds(result,),).toContain("dead_node",);
    const deadMessages = result.issues.filter((issue,) => issue.kind === "dead_node");
    expect(deadMessages.some((issue,) => issue.message.includes("5",)),).toBe(true,);
    expect(deadMessages.some((issue,) => issue.message.includes("4",)),).toBe(false,);
  });

  test("reports missing class_type as invalid shape", () => {
    const result = validateGraph({
      "1": { inputs: {}, },
      "3": { class_type: "SaveImage", inputs: { images: ["1", 0,], }, },
    },);
    expect(result.ok,).toBe(false,);
    expect(kinds(result,),).toContain("invalid_shape",);
  });

  test("rejects non-objects and empty graphs", () => {
    expect(kinds(validateGraph("nope",),),).toContain("invalid_shape",);
    expect(kinds(validateGraph(null,),),).toContain("invalid_shape",);
    const empty = validateGraph({},);
    expect(empty.ok,).toBe(false,);
    expect(empty.issues[0]!.message,).toContain("no nodes",);
  });

  test("rejects array entries without an id", () => {
    const result = validateGraph([{ class_type: "KSampler", inputs: {}, },],);
    expect(result.ok,).toBe(false,);
    expect(kinds(result,),).toContain("invalid_shape",);
  });
});
