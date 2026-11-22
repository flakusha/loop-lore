// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import { buildWorkflowGraph, } from "./row";

const SLOT_NODE = "498";

/** A minimal API-format graph with one 3-slot WASPowerLoraLoader. */
function slotGraph(): ComfyUIWorkflow {
  return {
    [SLOT_NODE]: {
      class_type: "WASPowerLoraLoader",
      inputs: {
        model: ["2", 0,],
        clip: ["3", 0,],
        lora_1: "None",
        lora_1_weight: 1,
        lora_1_enabled: false,
        lora_2: "None",
        lora_2_weight: 1,
        lora_2_enabled: false,
        lora_3: "None",
        lora_3_weight: 1,
        lora_3_enabled: false,
      },
    },
    "2": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "base.safetensors", }, },
    "3": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1, }, },
  };
}

function payload(body: ComfyUIWorkflow, withSlots: boolean,): WorkflowPayload {
  const slots = withSlots
    ? [{ nodeId: SLOT_NODE, classType: "WASPowerLoraLoader", label: "LoRA stack", },]
    : undefined;

  return {
    body,
    category: "txt2img",
    parameters: [],
    requiredNodes: ["WASPowerLoraLoader",],
    loraSlots: slots,
  };
}

function inputsOf(graph: ComfyUIWorkflow,): Record<string, unknown> {
  return graph[SLOT_NODE]!.inputs;
}

describe("buildWorkflowGraph declared LoRA slots", () => {
  it("fills declared slots with full filenames and clears the rest", () => {
    const body = slotGraph();
    const graph = buildWorkflowGraph(payload(body, true,), {
      loras: "detail.safetensors:0.6,style.safetensors:0.4",
    },);

    const inputs = inputsOf(graph,);

    expect(inputs.lora_1,).toBe("detail.safetensors",);
    expect(inputs.lora_1_weight,).toBe(0.6,);
    expect(inputs.lora_1_enabled,).toBe(true,);
    expect(inputs.lora_2,).toBe("style.safetensors",);
    expect(inputs.lora_2_weight,).toBe(0.4,);
    expect(inputs.lora_2_enabled,).toBe(true,);
    expect(inputs.lora_3,).toBe("None",);
    expect(inputs.lora_3_enabled,).toBe(false,);

    // The substituted source is untouched; only the returned graph is rewired.
    expect(inputsOf(body,).lora_1,).toBe("None",);
    expect(graph["2"],).toEqual(body["2"],);
  });

  it("fails closed when more LoRAs than declared slots are requested", () => {
    expect(() =>
      buildWorkflowGraph(payload(slotGraph(), true,), {
        loras: "a.safetensors:0.5,b.safetensors:0.5,c.safetensors:0.5,d.safetensors:0.5",
      },)
    ).toThrow(/only 3 LoRA slots/,);
  });

  it("fails closed when a declared slot names a node absent from the graph", () => {
    const value = payload(slotGraph(), true,);
    value.loraSlots = [{ nodeId: "404", classType: "WASPowerLoraLoader", label: "bad", },];
    expect(() => buildWorkflowGraph(value, { loras: "a.safetensors:0.5", },)).toThrow(
      /no node 404/,
    );
  });

  it("fails closed when a declared slot's class does not match the node", () => {
    const value = payload(slotGraph(), true,);
    value.loraSlots = [{ nodeId: SLOT_NODE, classType: "LoraLoader", label: "bad", },];
    expect(() => buildWorkflowGraph(value, { loras: "a.safetensors:0.5", },)).toThrow(
      /expected LoraLoader/,
    );
  });

  it("leaves a slotless workflow unchanged even when a loras param is supplied", () => {
    const body = slotGraph();
    const graph = buildWorkflowGraph(payload(body, false,), {
      loras: "a.safetensors:0.5",
    },);

    expect(graph,).toEqual(body,);
    expect(inputsOf(graph,).lora_1,).toBe("None",);
  });

  it("leaves a slot workflow unchanged when no LoRAs are requested", () => {
    const body = slotGraph();
    const graph = buildWorkflowGraph(payload(body, true,), {},);
    expect(graph,).toEqual(body,);
  });
});
