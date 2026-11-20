// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shipped API-format exports through the pre-submit pipeline (shape, dead
 * nodes, substitution, validation) with realistic vars. The two image-edit
 * exports pin their unreferenced nodes until the operator wires or drops them.
 * @module new-graph-flow
 */
import { describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import { findDeadNodes, } from "../workflow-loader/workflow-validation";
import {
  buildSubstitutionVars,
  collectPlaceholders,
  substituteWorkflow,
} from "../workflow-substitutor";
import { validateWorkflowPayload, } from "./validate";

const DIR = "configs/workflows";

function load(name: string,): Record<string, unknown> {
  return JSON.parse(readFileSync(`${DIR}/${name}`, "utf8",),);
}

const FLOW_VARS = buildSubstitutionVars({
  prompt: "a red car",
  negativePrompt: "blurry",
  width: 768,
  height: 512,
  steps: 20,
  cfgScale: 7,
  sampler: "euler",
  scheduler: "simple",
  seed: 42,
  clip_name: "test-clip.safetensors",
  unet_name: "test-unet.safetensors",
  unet_name_ref: "test-unet-ref.safetensors",
  vae_name: "test-vae.safetensors",
  audio_vae_name: "test-audio-vae.safetensors",
  upscale_model: "test-upscale.safetensors",
  input_image: "test.png",
  input_audio: "test.wav",
  duration_seconds: 5,
  fps: 24,
  shots: "3",
  soundscape: "quiet street",
  video_slot: "slot-a",
  segment_slots: "slot-a",
},);

const CLEAN_GRAPHS = [
  "minimax-h3-image-t2i-v1.json",
  "minimax-h3-audio-wf.json",
  "minimax-h3-assemble-wf.json",
  "minimax-h3-video-fl2va-v1.json",
  "minimax-h3-video-fl2va-opt-v1.json",
  "minimax-h3-video-ref2va-v1.json",
  "minimax-h3-video-ref2va-opt-v1.json",
] as const;

const DEAD_NODE_GRAPHS = [
  ["minimax-h3-image-image-edit-v1.json", ["62",], "dead node(s) not linked into the graph: 62",],
  ["qwen-image-2-1-image-edit-v1.json", ["472", "518",], "dead node(s) not linked into the graph: 472, 518",],
] as const;

describe("shipped workflow exports pre-submit flow", () => {
  for (const name of CLEAN_GRAPHS) {
    it(`${name} has no dead nodes and validates after substitution`, () => {
      const graph = load(name,);
      expect(findDeadNodes(graph as never,),).toEqual([],);
      const substituted = substituteWorkflow(graph, FLOW_VARS,);
      expect([...collectPlaceholders(substituted,),],).toEqual([],);
      expect(
        validateWorkflowPayload({
          body: substituted as never,
          category: "txt2img",
          parameters: [],
          requiredNodes: [],
        },).ok,
      )
        .toBe(true,);
    });
  }

  for (const [name, dead, error,] of DEAD_NODE_GRAPHS) {
    it(`${name} pins exactly its unreferenced nodes`, () => {
      const graph = load(name,);
      expect([...findDeadNodes(graph as never,),],).toEqual([...dead,],);
      const substituted = substituteWorkflow(graph, FLOW_VARS,);
      expect([...collectPlaceholders(substituted,),],).toEqual([],);
      const result = validateWorkflowPayload({
        body: substituted as never,
        category: "txt2img",
        parameters: [],
        requiredNodes: [],
      },);

      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.errors,).toEqual([error,],); }
    });
  }

  it("expands prompt variants deterministically on a real export", () => {
    const graph = load("sdxl-v1.json",);
    const vars = { ...FLOW_VARS, prompt: "{red|blue} car", };
    const opts = { expandVariants: true, variantSeed: 1, } as const;
    const first = substituteWorkflow(graph, vars, opts,) as Record<string, { inputs: { text: string } }>;
    const second = substituteWorkflow(graph, vars, opts,) as typeof first;
    const texts = Object.values(first,).flatMap((node,) => Object.values(node.inputs ?? {},)).filter((
      v,
    ): v is string => typeof v === "string" && v.includes("car",));

    expect(texts.length,).toBeGreaterThan(0,);
    for (const text of texts) { expect(["red car", "blue car",],).toContain(text,); }
    expect(second,).toEqual(first,);
  });

  it("image.generate exports bind prompt, negative prompt and aligned dimensions", () => {
    const defaults = JSON.parse(readFileSync("configs/workflow-defaults.json", "utf8",),) as {
      "image.generate": { supported: string[] };
    };

    // MiniMax H3 has no negative conditioning input; its zero-out branch is
    // the negative. Every other image.generate export has a negative slot.
    const negativeOptional = new Set(["minimax-h3-image-t2i-v1",],);
    for (const id of defaults["image.generate"].supported) {
      const placeholders = collectPlaceholders(load(`${id}.json`,),);
      for (const name of ["prompt", "width", "height",] as const) {
        expect(placeholders.has(name,),).toBe(true,);
      }

      if (!negativeOptional.has(id,)) {
        expect(placeholders.has("negative_prompt",),).toBe(true,);
      }
    }
  });
});
