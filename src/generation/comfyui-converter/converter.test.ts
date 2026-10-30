// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for widget mapping, pruning, and error paths.
 * Synthetic graphs only; real-workflow coverage lives in fixtures.test.ts.
 */
import { describe, expect, it, } from "bun:test";
import { ConverterError, convertWorkflow, } from "./index";
import type { ObjectInfoSnapshot, UiWorkflow, } from "./types";

const SNAPSHOT: ObjectInfoSnapshot = {
  CheckpointLoader: {
    input: { required: { ckpt_name: ["COMBO",], }, },
    input_order: { required: ["ckpt_name",], },
  },
  // Positional values cover widget inputs only (seed/steps), exactly like
  // real frontend widgets_values: socket inputs (model/positive) travel by
  // link and never appear positionally.
  KSampler: {
    input: {
      required: {
        model: ["MODEL",],
        seed: ["INT",],
        steps: ["INT",],
        positive: ["CONDITIONING",],
      },
    },
    input_order: { required: ["model", "seed", "steps", "positive",], },
  },
  EmptyLatentImage: {
    input: { required: { width: ["INT",], height: ["INT",], batch_size: ["INT",], }, },
    input_order: { required: ["width", "height", "batch_size",], },
  },
  SaveImage: {
    input: {
      required: { images: ["IMAGE",], },
      optional: { filename_prefix: ["STRING",], },
    },
    input_order: { required: ["images",], optional: ["filename_prefix",], },
  },
  SizeProbe: { input: { required: {}, }, input_order: { required: [], }, },
};

function failureOf(run: () => unknown,): string {
  try {
    run();
  } catch (error) {
    return (error as ConverterError).failure.kind;
  }

  return "no-throw";
}

describe("widget mapping", () => {
  it("prefers named widgets over positional values", () => {
    const workflow: UiWorkflow = {
      nodes: [
        {
          id: 1,
          type: "KSampler",
          widgets_values: ["stale", 1, 2,],
          widgets_values_named: { seed: 7, steps: 20, },
        },
      ],
    };

    const { graph, report, } = convertWorkflow(workflow, SNAPSHOT,);
    expect(graph["1"]?.inputs["seed"],).toBe(7,);
    expect(graph["1"]?.inputs["steps"],).toBe(20,);
    expect(report.unresolvedInputs,).toEqual([],);
  });

  it("falls back to input_order positions and lets links win", () => {
    const workflow: UiWorkflow = {
      nodes: [
        { id: 9, type: "SizeProbe", },
        {
          id: 1,
          type: "EmptyLatentImage",
          inputs: [{ name: "width", type: "INT", link: 5, },],
          widgets_values: [64, 128, 2,],
        },
      ],
      links: [[5, 9, 0, 1, 0, "INT",],],
    };

    const { graph, } = convertWorkflow(workflow, SNAPSHOT,);
    expect(graph["1"]?.inputs["width"],).toEqual(["9", 0,],);
    expect(graph["1"]?.inputs["height"],).toBe(128,);
    expect(graph["1"]?.inputs["batch_size"],).toBe(2,);
  });

  it("drops phantom widgets without shifting positions", () => {
    const workflow: UiWorkflow = {
      nodes: [
        { id: 9, type: "SizeProbe", },
        {
          id: 1,
          type: "KSampler",
          inputs: [
            { name: "model", type: "MODEL", link: 5, },
            { name: "positive", type: "CONDITIONING", link: 6, },
          ],
          widgets_values: [42, "fixed", 30,],
        },
      ],
      links: [
        [5, 9, 0, 1, 0, "MODEL",],
        [6, 9, 1, 1, 3, "CONDITIONING",],
      ],
    };

    const { graph, } = convertWorkflow(workflow, SNAPSHOT,);
    expect(graph["1"]?.inputs["seed"],).toBe(42,);
    expect(graph["1"]?.inputs["steps"],).toBe(30,);
    expect("control_after_generate" in (graph["1"]?.inputs ?? {}),).toBe(false,);
  });

  it("wraps array values and reports unmapped positions", () => {
    const workflow: UiWorkflow = {
      nodes: [
        {
          id: 1,
          type: "SaveImage",
          widgets_values_named: { filename_prefix: ["a", "b",], },
        },
        { id: 2, type: "CheckpointLoader", widgets_values: ["x", "extra",], },
      ],
    };

    const { graph, report, } = convertWorkflow(workflow, SNAPSHOT,);
    expect(graph["1"]?.inputs["filename_prefix"],).toEqual({ __value__: ["a", "b",], },);
    expect(report.unresolvedInputs,).toEqual([{ node: "2", input: "widgets[1]", },],);
    expect(graph["2"]?.inputs["ckpt_name"],).toBe("x",);
  });

  it("drops serialize-false widgets via options", () => {
    const workflow: UiWorkflow = {
      nodes: [
        {
          id: 1,
          type: "SaveImage",
          widgets_values_named: { images: "keep", ui_state: "drop", },
        },
      ],
    };

    const { graph, } = convertWorkflow(workflow, SNAPSHOT, {
      serializeFalseWidgets: { SaveImage: ["ui_state",], },
    },);

    expect("ui_state" in (graph["1"]?.inputs ?? {}),).toBe(false,);
  });
});

describe("pruning and report", () => {
  it("excludes muted/bypassed nodes and prunes dangling inputs", () => {
    const workflow: UiWorkflow = {
      nodes: [
        { id: 1, type: "CheckpointLoader", widgets_values: ["a.ckpt",], },
        {
          id: 2,
          type: "KSampler",
          mode: 2,
          inputs: [{ name: "model", type: "MODEL", link: 5, },],
          widgets_values: ["fixed", 1, 2,],
        },
        {
          id: 3,
          type: "KSampler",
          mode: 8,
          inputs: [{ name: "model", type: "MODEL", link: 5, },],
          widgets_values: ["fixed", 3, 4,],
        },
        {
          id: 4,
          type: "KSampler",
          inputs: [{ name: "model", type: "MODEL", link: 6, },],
          widgets_values: ["fixed", 5, 6,],
        },
      ],
      links: [
        [5, 1, 0, 2, 0, "MODEL",],
        [6, 2, 0, 4, 0, "MODEL",],
      ],
    };

    const { graph, report, } = convertWorkflow(workflow, SNAPSHOT,);
    expect(report.mutedDropped,).toEqual(["2",],);
    expect(report.bypassedDropped,).toEqual(["3",],);
    expect(graph["2"],).toBeUndefined();
    expect(graph["3"],).toBeUndefined();
    expect(graph["4"]?.inputs["model"],).toBeUndefined();
    expect(report.prunedDangling,).toEqual([{ node: "4", input: "model", from: "2", },],);
  });

  it("skips notes and records pack identity", () => {
    const workflow: UiWorkflow = {
      nodes: [
        { id: 1, type: "MarkdownNote", widgets_values: ["memo",], },
        {
          id: 2,
          type: "CheckpointLoader",
          title: "Loader",
          properties: { cnr_id: "pack-id", ver: "2", },
          widgets_values: ["a.ckpt",],
        },
      ],
    };

    const { graph, report, } = convertWorkflow(workflow, SNAPSHOT,);
    expect(graph["1"],).toBeUndefined();
    expect(report.notesSkipped,).toEqual(["1",],);
    expect(report.packIdentity,).toEqual([{ class: "CheckpointLoader", cnr_id: "pack-id", ver: "2", },],);
    expect(graph["2"]?._meta,).toEqual({ title: "Loader", cnr_id: "pack-id", ver: "2", },);
  });
});

describe("error paths", () => {
  it("rejects unknown classes", () => {
    const workflow: UiWorkflow = { nodes: [{ id: 1, type: "Nope", },], };
    expect(failureOf(() => convertWorkflow(workflow, SNAPSHOT,)),).toBe("unknown-class",);
  });

  it("rejects malformed links", () => {
    const workflow = {
      nodes: [{ id: 1, type: "CheckpointLoader", widgets_values: ["a",], },],
      links: [[1, "1",],],
    } as unknown as UiWorkflow;

    expect(failureOf(() => convertWorkflow(workflow, SNAPSHOT,)),).toBe("malformed-link",);
  });

  it("rejects malformed workflows", () => {
    const workflow = { nodes: {}, } as unknown as UiWorkflow;
    expect(failureOf(() => convertWorkflow(workflow, SNAPSHOT,)),).toBe("malformed-workflow",);
  });

  it("rejects unresolvable subgraph references", () => {
    const workflow: UiWorkflow = { nodes: [{ id: 9, type: "ghost-def-1", },], };
    expect(failureOf(() => convertWorkflow(workflow, SNAPSHOT,)),).toBe("missing-subgraph",);
  });
});
