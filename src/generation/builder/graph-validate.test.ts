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

  test("reports a node whose input links back to itself", () => {
    const result = validateGraph({ a: { class_type: "KSampler", inputs: { model: ["a", 0,], }, }, },);
    expect(result.ok,).toBe(false,);
    expect(kinds(result,),).toContain("cycle",);
    expect(result.issues.find((issue,) => issue.kind === "cycle")?.message,).toContain("a",);
  });

  test("reports every node of a three-node cycle", () => {
    const result = validateGraph({
      a: { class_type: "A", inputs: { x: ["b", 0,], }, },
      b: { class_type: "B", inputs: { x: ["c", 0,], }, },
      c: { class_type: "C", inputs: { x: ["a", 0,], }, },
    },);
    expect(kinds(result,),).toContain("cycle",);
    const message = result.issues.find((issue,) => issue.kind === "cycle")?.message ?? "";
    expect(message,).toContain("a",);
    expect(message,).toContain("b",);
    expect(message,).toContain("c",);
  });

  test("reports one issue per distinct unknown source, not per edge", () => {
    const result = validateGraph({ a: { class_type: "A", inputs: { x: ["zz", 0,], y: ["zz", 1,], }, }, },);
    const dangling = result.issues.filter((issue,) => issue.message.includes("unknown node zz",));
    expect(dangling,).toHaveLength(1,);
  });

  test("accumulates independent problems instead of stopping at the first", () => {
    const result = validateGraph({
      cyc1: { class_type: "A", inputs: { x: ["cyc2", 0,], }, },
      cyc2: { class_type: "B", inputs: { x: ["cyc1", 0,], }, },
      bad: { class_type: "KSampler", inputs: { model: ["ghost", 0,], }, },
      noClass: { inputs: {}, },
    },);
    const found = kinds(result,);
    expect(found,).toContain("cycle",);
    expect(found,).toContain("missing_input",);
    expect(found,).toContain("invalid_shape",);
  });

  test("accepts two disconnected components that each end in a sink", () => {
    const result = validateGraph({
      a: { class_type: "CheckpointLoaderSimple", inputs: {}, },
      b: { class_type: "KSampler", inputs: { model: ["a", 0,], }, },
      c: { class_type: "SaveImage", inputs: { images: ["b", 0,], }, },
      d: { class_type: "SaveImage", inputs: {}, },
    },);
    expect(result.ok,).toBe(true,);
    expect(result.issues,).toEqual([],);
  });
});
