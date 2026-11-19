// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Catalog readiness for the pinned MiniMax H3 workflow names.
 *
 * The real workflow JSONs are operator exports from the ComfyUI UI (B2, no
 * production export exists yet). These tests synthesize MINIMAL API-format
 * graphs carrying the exact per-name variable surface, node classes, and
 * bucket shapes from the export contract, so an operator export can be
 * mechanically validated against the same assertions: the loader accepts and
 * substitutes it, every terminal sink is a registered sink class, and the
 * H2 continuity rule (loud failure, not a silent null latent) applies.
 *
 * Fixtures are hand-written per name — no live ComfyUI involved. The loader
 * is a process-global singleton (first workflowsDir wins), so this file
 * resets it and uses its own fixture directory, mirroring loader.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { mkdir, rm, writeFile, } from "node:fs/promises";

import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { getWorkflowLoader, resetWorkflowLoaderForTests, } from "../workflow-loader/loader";
import { TERMINAL_SINK_CLASSES, } from "../workflow-loader/workflow-validation";

const DIR = ".tmp/wf-fixtures-minimax-catalog";

/** Fragment graph: six-variable contract, video sink, continuity emitter. */
function fragmentGraph(mode: string,): ComfyUIWorkflow {
  return {
    "1": { class_type: `DaSiWaH3${mode}Loader`, inputs: { seed: "{{seed}}", }, },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: "{{prompt}}",
        timeline_data: "{{timeline_data}}",
        builder_state: "{{builder_state}}",
        duration: "{{duration_seconds}}",
      },
    },
    "3": { class_type: "LoadImage", inputs: { image: "{{reference_slots}}", }, },
    "4": { class_type: "KSampler", inputs: { model: ["1", 0,], positive: ["2", 0,], image: ["3", 0,], }, },
    // Continuity publish: text-only UI message; the export contract pairs it
    // with a files-bucket checkpoint emitter (real exports) — the run
    // pipeline fails loudly (ivss_latent_missing) when none lands.
    "5": { class_type: "DaSiWaH3ContinuityPublish", inputs: { latents: ["4", 0,], }, },
    "6": { class_type: "DaSiWa_EnhancedVideoCombine", inputs: { images: ["4", 1,], }, },
  };
}

const ASSEMBLE_GRAPH: ComfyUIWorkflow = {
  "1": {
    class_type: "DaSiWaH3ClipAssemble",
    inputs: {
      segment_slots: "{{segment_slots}}",
      transition: "{{transition}}",
      fps: "{{fps}}",
    },
  },
};

const AUDIO_FALLBACK_GRAPH: ComfyUIWorkflow = {
  "1": { class_type: "LoadAudio", inputs: { audio: "{{video_slot}}", }, },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", }, },
  "3": { class_type: "KSampler", inputs: { audio: ["1", 0,], positive: ["2", 0,], seed: "{{seed}}", }, },
  "4": { class_type: "SaveAudio", inputs: { audio: ["3", 0,], }, },
};

/** A fragment whose only latent emitter is the continuity publish (H2 shape). */
const CONTINUITY_ONLY_GRAPH: ComfyUIWorkflow = {
  "1": { class_type: "DaSiWaH3ContinuityPublish", inputs: { message: "published", }, },
  "2": { class_type: "DaSiWa_EnhancedVideoCombine", inputs: { images: "{{prompt}}", }, },
};

const FIXTURES: Record<string, ComfyUIWorkflow> = {
  "minimax-h3-t2v-fragment-v1": fragmentGraph("T2V",),
  "minimax-h3-i2v-fragment-v1": fragmentGraph("I2V",),
  "minimax-h3-ref2va-fragment-v1": fragmentGraph("Ref2VA",),
  "minimax-h3-fragment-assemble-v1": ASSEMBLE_GRAPH,
  "minimax-h3-audio-fallback-v1": AUDIO_FALLBACK_GRAPH,
  "minimax-h3-continuity-no-latent": CONTINUITY_ONLY_GRAPH,
};

const FRAGMENT_VARS = {
  prompt: "a dusk walk",
  timeline_data: '[{"shot":"s1"}]',
  builder_state: '{"duration":4.25}',
  duration_seconds: 4.25,
  seed: "9007199254740995",
  reference_slots: "[]",
};

const ASSEMBLE_VARS = { segment_slots: "[]", transition: "cut", fps: 24, };
const AUDIO_VARS = { video_slot: "clip.webm", prompt: "wind", seed: "7", };

async function fixtures(): Promise<void> {
  await mkdir(DIR, { recursive: true, },);
  for (const [name, graph,] of Object.entries(FIXTURES,)) {
    await writeFile(`${DIR}/${name}.json`, JSON.stringify(graph,),);
  }
}

function inputOf(workflow: ComfyUIWorkflow, nodeId: string,): Record<string, unknown> {
  const node = workflow[nodeId];
  if (!node || typeof node.inputs !== "object" || node.inputs === null) {
    throw new Error(`node ${nodeId} has no inputs`,);
  }

  return node.inputs as Record<string, unknown>;
}

beforeAll(async () => {
  resetWorkflowLoaderForTests();
  await fixtures();
},);

afterAll(async () => {
  await rm(DIR, { recursive: true, force: true, },);
},);

describe("minimax-h3 catalog readiness", () => {
  it("loads every catalog name and substitutes its variable surface", async () => {
    const loader = getWorkflowLoader(DIR,);
    const listed = await loader.listWorkflows();
    for (const name of Object.keys(FIXTURES,)) {
      expect(listed,).toContain(name,);
    }

    const fragment = await loader.loadWorkflow({
      name: "minimax-h3-t2v-fragment-v1",
      vars: FRAGMENT_VARS,
    },);

    const samplerInputs = inputOf(fragment, "2",);
    expect(samplerInputs.text,).toBe(FRAGMENT_VARS.prompt,);
    expect(samplerInputs.timeline_data,).toBe(FRAGMENT_VARS.timeline_data,);
    expect(samplerInputs.builder_state,).toBe(FRAGMENT_VARS.builder_state,);
    // Whole-string numeric placeholders yield numbers: the Director duration
    // FLOAT input must receive seconds, not a stringified numeric.
    expect(samplerInputs.duration,).toBe(4.25,);
    expect(inputOf(fragment, "3",).image,).toBe(FRAGMENT_VARS.reference_slots,);
    expect(inputOf(fragment, "1",).seed,).toBe(FRAGMENT_VARS.seed,);

    const assemble = await loader.loadWorkflow({
      name: "minimax-h3-fragment-assemble-v1",
      vars: ASSEMBLE_VARS,
    },);

    expect(inputOf(assemble, "1",).segment_slots,).toBe(ASSEMBLE_VARS.segment_slots,);
    expect(inputOf(assemble, "1",).transition,).toBe(ASSEMBLE_VARS.transition,);
    expect(inputOf(assemble, "1",).fps,).toBe(24,);

    const audio = await loader.loadWorkflow({
      name: "minimax-h3-audio-fallback-v1",
      vars: AUDIO_VARS,
    },);

    expect(inputOf(audio, "1",).audio,).toBe(AUDIO_VARS.video_slot,);
    expect(inputOf(audio, "2",).text,).toBe(AUDIO_VARS.prompt,);
    expect(inputOf(audio, "3",).seed,).toBe(AUDIO_VARS.seed,);
  });

  it("classifies every catalog terminal sink through the sink registry", () => {
    for (const graph of Object.values(FIXTURES,)) {
      const referenced = new Set<string>();
      for (const node of Object.values(graph,)) {
        for (const value of Object.values(node.inputs ?? {},)) {
          if (Array.isArray(value,) && typeof value[0] === "string") {
            referenced.add(value[0],);
          }
        }
      }

      const sinks = Object.entries(graph,)
        .filter(([id,],) => !referenced.has(id,))
        .map(([, node,],) => node.class_type);

      expect(sinks.length,).toBeGreaterThan(0,);
      for (const sink of sinks) {
        expect(TERMINAL_SINK_CLASSES.has(sink,),).toBe(true,);
      }
    }

    // Bucket contract: the fragment video sink is a gifs-bucket class the
    // poll maps to video; the audio fallback ends in the audio bucket.
    expect(TERMINAL_SINK_CLASSES.has("DaSiWa_EnhancedVideoCombine",),).toBe(true,);
    expect(TERMINAL_SINK_CLASSES.has("SaveAudio",),).toBe(true,);
  });

  it("loads continuity-only fragment shapes; the latent gate is at run time (H2)", async () => {
    // Verified node inventory (minimax-h3-export-cheatsheet-2026-11-19.md
    // §6 gotcha 3): no installed node writes an H3 NestedTensor latent
    // package into the files bucket, so NO fragment graph can carry a
    // files-bucket latent emitter today — ingest-side rejection was rejected
    // because it would refuse every expressible fragment graph. The chosen
    // mitigation is the run-time named failure (`latent_not_captured`,
    // covered by run-pipeline.test.ts): the continuity-only H2 shape loads
    // fine here and fails loudly at run, never persisting a null
    // latent_asset_id silently.
    const loader = getWorkflowLoader(DIR,);
    const loaded = await loader.loadWorkflow({
      name: "minimax-h3-continuity-no-latent",
      vars: { prompt: "a dusk walk", },
    },);

    expect(Object.keys(loaded,).length,).toBe(2,);
    expect(usesFilesBucketEmitter(FIXTURES["minimax-h3-continuity-no-latent"]!,),).toBe(false,);
    expect(usesFilesBucketEmitter(FIXTURES["minimax-h3-t2v-fragment-v1"]!,),).toBe(false,);
  });
});

/** Files-bucket emitter classes an export could declare (none installed today). */
function usesFilesBucketEmitter(graph: ComfyUIWorkflow,): boolean {
  const emitters: Record<string, true> = {
    ModelSaveKJ: true,
    MiniMaxH3LQPackageSave: true,
    SaveLatent: true,
  };

  for (const node of Object.values(graph,)) {
    if (emitters[node.class_type]) { return true; }
  }

  return false;
}
