// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ingest validation tests.
 *
 * The cases here are the ones that would otherwise only surface at 3am inside
 * a generation queue: a dead node, a parameter the graph never references, a
 * LoRA slot pointing at a node that does not exist.
 */
import { describe, expect, it, } from "bun:test";
import { validateWorkflowPayload, } from "./validate";

/**
 * A minimal LINKED graph: 1 -> 2 -> 3.
 *
 * The [nodeId, slot] arrays are real ComfyUI links, not decoration — without
 * them nodes 1 and 2 are unreferenced and findDeadNodes correctly rejects the
 * graph. Node 3 is a terminal sink and is never a link source.
 */
const GOOD_GRAPH = {
  "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{model}}", }, },
  "2": {
    class_type: "KSampler",
    inputs: { model: ["1", 0,], seed: "{{seed}}", width: "{{width}}", },
  },
  "3": { class_type: "SaveImage", inputs: { images: ["2", 0,], filename_prefix: "out", }, },
};

const BASE = {
  body: GOOD_GRAPH,
  category: "txt2img",
  parameters: [],
  requiredNodes: ["CheckpointLoaderSimple", "KSampler", "SaveImage",],
};

describe("validateWorkflowPayload", () => {
  it("accepts a fully linked graph", () => {
    const result = validateWorkflowPayload(BASE,);
    expect(result.ok,).toBe(true,);
  });

  it("rejects a dead non-sink node", () => {
    const result = validateWorkflowPayload({
      ...BASE,
      body: {
        ...GOOD_GRAPH,
        "9": { class_type: "CLIPLoader", inputs: { clip_name: "x", }, },
      },
    },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("9",);
    }
  });

  it("does not treat a terminal sink as dead", () => {
    // SaveImage is never a link source, so it must not be flagged.
    const result = validateWorkflowPayload(BASE,);
    expect(result.ok,).toBe(true,);
  });

  it("rejects a declared parameter with no placeholder in the graph", () => {
    const result = validateWorkflowPayload({
      ...BASE,
      parameters: [{ name: "cfg_scale", type: "number", label: "CFG", default: 7, },],
    },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("cfg_scale",);
    }
  });

  it("accepts a declared parameter that does have a placeholder", () => {
    const result = validateWorkflowPayload({
      ...BASE,
      parameters: [{ name: "width", type: "number", label: "Width", default: 768, },],
    },);
    expect(result.ok,).toBe(true,);
  });

  it("rejects a duplicate parameter name", () => {
    const result = validateWorkflowPayload({
      ...BASE,
      parameters: [
        { name: "width", type: "number", label: "W", default: 1, },
        { name: "width", type: "number", label: "W2", default: 2, },
      ],
    },);
    expect(result.ok,).toBe(false,);
  });

  it("rejects a LoRA slot pointing at a node that does not exist", () => {
    const result = validateWorkflowPayload({
      ...BASE,
      loraSlots: [{ nodeId: "404", classType: "LoraLoader", label: "Style", },],
    },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("404",);
    }
  });

  it("rejects a LoRA slot whose node has a different class", () => {
    const result = validateWorkflowPayload({
      ...BASE,
      loraSlots: [{ nodeId: "2", classType: "LoraLoader", label: "Style", },],
    },);
    expect(result.ok,).toBe(false,);
  });

  it("accepts a LoRA slot that matches a real node", () => {
    const result = validateWorkflowPayload({
      ...BASE,
      loraSlots: [{ nodeId: "2", classType: "KSampler", label: "Sampler", },],
    },);
    expect(result.ok,).toBe(true,);
  });

  it("rejects a node missing class_type or inputs", () => {
    const bad = validateWorkflowPayload({ ...BASE, body: { "1": { inputs: {}, }, }, },);
    expect(bad.ok,).toBe(false,);

    const noInputs = validateWorkflowPayload({ ...BASE, body: { "1": { class_type: "X", }, }, },);
    expect(noInputs.ok,).toBe(false,);
  });

  it("rejects an empty graph", () => {
    const result = validateWorkflowPayload({ ...BASE, body: {}, },);
    expect(result.ok,).toBe(false,);
  });

  it("rejects an unknown category", () => {
    const result = validateWorkflowPayload({ ...BASE, category: "not-a-category", },);
    expect(result.ok,).toBe(false,);
  });

  it("rejects missing metadata arrays", () => {
    expect(validateWorkflowPayload({ body: GOOD_GRAPH, category: "txt2img", },).ok,).toBe(false,);
    expect(
      validateWorkflowPayload({ body: GOOD_GRAPH, parameters: [], requiredNodes: [], },).ok,
    ).toBe(false,);
  });

  it("rejects a non-object payload", () => {
    expect(validateWorkflowPayload("nope",).ok,).toBe(false,);
    expect(validateWorkflowPayload(null,).ok,).toBe(false,);
    expect(validateWorkflowPayload([],).ok,).toBe(false,);
  });
});
