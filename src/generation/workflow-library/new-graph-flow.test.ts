// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * New-graph promotion flow: the converted qwen-edit and MiniMax H3 reference
 * graphs through the pre-submit pipeline (shape, dead nodes, substitution,
 * validation) with realistic vars. The three video graphs pin the known
 * orphaned rule node 35 — promotion to `configs/workflows/` must wire or
 * drop it before the strict loader will ingest them.
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

const DIR = "configs/workflows/originals";

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
  ["qwen-edit-wf.json", "img2img",],
  ["minimax-h3-image-wf.json", "txt2img",],
  ["minimax-h3-audio-wf.json", "txt2img",],
  ["minimax-h3-assemble-wf.json", "txt2img",],
] as const;

const VIDEO_GRAPHS = [
  "minimax-h3-video-t2v-wf.json",
  "minimax-h3-video-i2v-wf.json",
  "minimax-h3-video-ref2va-wf.json",
] as const;

describe("new reference graphs pre-submit flow", () => {
  for (const [name, category,] of CLEAN_GRAPHS) {
    it(`${name} has no dead nodes and validates after substitution`, () => {
      const graph = load(name,);
      expect(findDeadNodes(graph as never,),).toEqual([],);
      const substituted = substituteWorkflow(graph, FLOW_VARS,);
      expect([...collectPlaceholders(substituted,),],).toEqual([],);
      expect(validateWorkflowPayload({ body: substituted as never, category, parameters: [], requiredNodes: [], },).ok,)
        .toBe(true,);
    });
  }

  for (const name of VIDEO_GRAPHS) {
    it(`${name} pins the orphaned rule node 35 and nothing else`, () => {
      const graph = load(name,);
      expect(findDeadNodes(graph as never,),).toEqual(["35",],);
      const substituted = substituteWorkflow(graph, FLOW_VARS,);
      expect([...collectPlaceholders(substituted,),],).toEqual([],);
      const result = validateWorkflowPayload({
        body: substituted as never,
        category: "txt2img",
        parameters: [],
        requiredNodes: [],
      },);

      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.errors,).toEqual(["dead node(s) not linked into the graph: 35",],); }
    });
  }

  it("expands prompt variants deterministically on a real graph", () => {
    const graph = load("qwen-edit-wf.json",);
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
});
