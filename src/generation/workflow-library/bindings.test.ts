// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Binding config + planner tests. Graphs here are two to five inline nodes —
 * no DB, network or loader involved.
 */
import { describe, expect, it, } from "bun:test";
import type { TemplateParameter, } from "../../image-edit/types";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import {
  bindingPlaceholders,
  parseWorkflowBindings,
  planWorkflowBindings,
  type WorkflowBindingSpec,
} from "./bindings";

const SHA = "a".repeat(64,);

const PARAMETERS: readonly TemplateParameter[] = [
  { name: "prompt", type: "string", label: "Prompt", default: "", },
  { name: "seed", type: "number", label: "Seed", default: 0, },
  { name: "frames", type: "image", label: "Frames", default: [], },
];

const SCALAR = {
  kind: "scalar",
  parameter: "prompt",
  target: { node: "1", input: "text", },
} as const;

const DEFAULT_FANOUT = {
  kind: "fanout",
  parameter: "frames",
  targetTemplate: { node: "frame_{index}", input: "image", },
  emitAs: "frame_{index}",
} as const;

const FANOUT = { ...DEFAULT_FANOUT, maxItems: 2, } as const;

const CONFIG = {
  schemaVersion: 1,
  bindingPolicy: "augment",
  snapshot: { objectInfoSha256: `sha256:${SHA}`, source: "generator.local", },
  workflows: {
    txt2img: { parameters: PARAMETERS, bindings: [SCALAR, FANOUT,], },
  },
};

/** Small graph with one node per target used by the planner tests. */
function graph(): ComfyUIWorkflow {
  return {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", }, },
    "2": { class_type: "KSampler", inputs: { seed: "{{seed}}", }, },
    "frame_0": { class_type: "LoadImage", inputs: { image: "{{frame_0}}", }, },
    "frame_1": { class_type: "LoadImage", inputs: { image: "{{frame_1}}", }, },
  };
}

describe("parseWorkflowBindings", () => {
  it("accepts a valid config", () => {
    expect(parseWorkflowBindings(CONFIG,).ok,).toBe(true,);
  });

  it("rejects a bad binding policy", () => {
    const result = parseWorkflowBindings({ ...CONFIG, bindingPolicy: "wild", },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("bindingPolicy",);
    }
  });

  it("rejects duplicate parameter names", () => {
    const result = parseWorkflowBindings({
      ...CONFIG,
      workflows: {
        txt2img: {
          ...CONFIG.workflows.txt2img,
          parameters: [
            ...PARAMETERS,
            { name: "prompt", type: "string", label: "Again", default: "", },
          ],
        },
      },
    },);

    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("duplicate parameter",);
    }
  });

  it("rejects fanout templates and emit patterns without {index}", () => {
    for (
      const rule of [
        { ...FANOUT, targetTemplate: { node: "frame", input: "image", }, },
        { ...FANOUT, emitAs: "frame", },
      ]
    ) {
      const result = parseWorkflowBindings({
        ...CONFIG,
        workflows: { txt2img: { bindings: [rule,], }, },
      },);

      expect(result.ok,).toBe(false,);
      if (!result.ok) {
        expect(result.errors.join(" ",),).toContain("{index}",);
      }
    }
  });
});

describe("bindingPlaceholders", () => {
  it("includes scalar names and every configured fanout index", () => {
    const spec: WorkflowBindingSpec = { parameters: PARAMETERS, bindings: [SCALAR, FANOUT,], };
    expect(bindingPlaceholders(spec,),).toEqual(["prompt", "frame_0", "frame_1",],);
  });

  it("expands the default index range 0..3", () => {
    const spec: WorkflowBindingSpec = { bindings: [DEFAULT_FANOUT,], };
    expect(bindingPlaceholders(spec,),).toEqual(
      ["frame_0", "frame_1", "frame_2", "frame_3",],
    );
  });

  it("expands from a custom startIndex", () => {
    const spec: WorkflowBindingSpec = {
      bindings: [{ ...FANOUT, startIndex: 2, emitAs: "shot_{index}", },],
    };

    expect(bindingPlaceholders(spec,),).toEqual(["shot_2", "shot_3",],);
  });
});

describe("planWorkflowBindings", () => {
  it("resolves node and unique classType, then expands array values", () => {
    const spec: WorkflowBindingSpec = {
      bindings: [
        SCALAR,
        { kind: "scalar", parameter: "seed", target: { classType: "KSampler", input: "seed", }, },
        FANOUT,
      ],
    };

    const result = planWorkflowBindings(spec, graph(), {
      prompt: "a cat",
      seed: 7,
      frames: ["a.png", 3,],
    },);

    expect(result,).toEqual({
      ok: true,
      vars: { prompt: "a cat", seed: 7, frame_0: "a.png", frame_1: 3, },
    },);
  });

  it("fails on an unknown node id", () => {
    const spec: WorkflowBindingSpec = {
      bindings: [{ kind: "scalar", parameter: "prompt", target: { node: "missing", input: "text", }, },],
    };

    const result = planWorkflowBindings(spec, graph(), { prompt: "x", },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("unknown node",);
    }
  });

  it("fails on an ambiguous classType", () => {
    const g = graph();
    g["2b"] = { class_type: "KSampler", inputs: { seed: "{{seed}}", }, };
    const spec: WorkflowBindingSpec = {
      bindings: [{ kind: "scalar", parameter: "seed", target: { classType: "KSampler", input: "seed", }, },],
    };

    const result = planWorkflowBindings(spec, g, { seed: 1, },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("ambiguous",);
    }
  });

  it("fails closed when the target no longer holds the placeholder", () => {
    const g = graph();
    g["1"] = { class_type: "CLIPTextEncode", inputs: { text: "already filled", }, };
    const spec: WorkflowBindingSpec = { bindings: [SCALAR,], };
    const result = planWorkflowBindings(spec, g, { prompt: "x", },);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.errors.join(" ",),).toContain("fail-closed",);
    }
  });
});
