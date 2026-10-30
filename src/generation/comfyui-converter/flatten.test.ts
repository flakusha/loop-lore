// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Boundary-flattening tests over a synthetic two-pin subgraph.
 * Proves colon-path ids, fan-out rewiring, promotion, and global refs.
 */
import { describe, expect, it, } from "bun:test";
import { convertWorkflow, } from "./index";
import type {
  ObjectInfoSnapshot,
  SubgraphDefinition,
  UiWorkflow,
} from "./types";

const SNAPSHOT: ObjectInfoSnapshot = {
  CheckpointLoader: {
    input: { required: { ckpt_name: ["COMBO",], }, },
    input_order: { required: ["ckpt_name",], },
  },
  SaveImage: {
    input: {
      required: { images: ["IMAGE",], },
      optional: { filename_prefix: ["STRING",], },
    },
    input_order: { required: ["images",], optional: ["filename_prefix",], },
  },
};

const DEFINITION: SubgraphDefinition = {
  id: "abc-def",
  nodes: [
    { id: -10, type: "SubgraphInput", inputs: [], outputs: [], },
    {
      id: 1,
      type: "CheckpointLoader",
      inputs: [{ name: "ckpt_in", type: "*", link: 11, },],
      outputs: [{ name: "ckpt", type: "MODEL", links: [12,], },],
      widgets_values: ["inner.ckpt",],
    },
    { id: -20, type: "SubgraphOutput", inputs: [], outputs: [], },
  ],
  links: [
    { id: 11, origin_id: -10, origin_slot: 0, target_id: 1, target_slot: 0, type: "*", },
    { id: 12, origin_id: 1, origin_slot: 0, target_id: -20, target_slot: 0, type: "*", },
  ],
  inputs: [{ name: "ckpt_in", linkIds: [11,], },],
  outputs: [{ name: "ckpt", linkIds: [12,], },],
  inputNode: { id: -10, },
  outputNode: { id: -20, },
};

function linkedWorkflow(): UiWorkflow {
  return {
    nodes: [
      { id: 2, type: "CheckpointLoader", widgets_values: ["outer.ckpt",], },
      {
        id: 9,
        type: "abc-def",
        inputs: [{ name: "ckpt_in", type: "*", link: 101, },],
        outputs: [{ name: "ckpt", type: "MODEL", links: [102,], },],
      },
      {
        id: 3,
        type: "SaveImage",
        inputs: [{ name: "images", type: "IMAGE", link: 102, },],
        widgets_values_named: { filename_prefix: "out", },
      },
    ],
    links: [
      [101, 2, 0, 9, 0, "*",],
      [102, 9, 0, 3, 0, "MODEL",],
    ],
    definitions: { subgraphs: [DEFINITION,], },
  };
}

describe("subgraph flattening", () => {
  it("inlines instances with colon-path ids and rewires boundaries", () => {
    const { graph, report, } = convertWorkflow(linkedWorkflow(), SNAPSHOT,);
    expect(graph["9"],).toBeUndefined();
    expect(graph["9:1"]?.inputs["ckpt_name"],).toBe("inner.ckpt",);
    expect(graph["9:1"]?.inputs["ckpt_in"],).toEqual(["2", 0,],);
    expect(graph["3"]?.inputs["images"],).toEqual(["9:1", 0,],);
    expect(report.nodeCount,).toBe(3,);
  });

  it("applies promoted container values to inner defaults", () => {
    const workflow = linkedWorkflow();
    const nodes = workflow.nodes ?? [];
    const head = nodes[0] ?? { id: 2, type: "CheckpointLoader", };
    const instance = { ...(nodes[1] ?? { id: 9, type: "abc-def", }), inputs: [], widgets_values: ["promoted.ckpt",], };
    const promoted: UiWorkflow = {
      ...workflow,
      nodes: [head, instance, ...(nodes[2] === undefined ? [] : [nodes[2],]),],
      links: [[102, 9, 0, 3, 0, "MODEL",],],
    };

    const { graph, } = convertWorkflow(promoted, SNAPSHOT,);
    expect(graph["9:1"]?.inputs["ckpt_in"],).toBe("promoted.ckpt",);
  });

  it("resolves global-subgraph references from the caller map", () => {
    const workflow = linkedWorkflow();
    const { graph, } = convertWorkflow(
      { nodes: workflow.nodes, links: workflow.links, },
      SNAPSHOT,
      { globalSubgraphs: { "abc-def": DEFINITION, }, },
    );

    expect(graph["9:1"]?.inputs["ckpt_in"],).toEqual(["2", 0,],);
    expect(graph["3"]?.inputs["images"],).toEqual(["9:1", 0,],);
  });
});
