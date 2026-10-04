// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { findDeadNodes, } from "./workflow-validation";

describe("findDeadNodes", () => {
  it("returns nothing for a fully linked graph", () => {
    const wf: ComfyUIWorkflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: {}, },
      "2": { class_type: "KSampler", inputs: { model: ["1", 0,], }, },
      "3": { class_type: "SaveImage", inputs: { images: ["2", 0,], }, },
    };

    expect(findDeadNodes(wf,),).toEqual([],);
  });

  it("does not treat a terminal sink as dead (Defect 3)", () => {
    // A link is [nodeId, slot], so a sink is never a link source. Treating
    // unreferenced as dead would reject every real ComfyUI export.
    const wf: ComfyUIWorkflow = {
      "5": { class_type: "CLIPTextEncode", inputs: { text: "cat", }, },
      "46": { class_type: "SaveImage", inputs: { images: ["5", 0,], }, },
    };

    expect(findDeadNodes(wf,),).toEqual([],);
  });

  it("flags an unreferenced node that is not a sink", () => {
    // Shape taken from the operator's i-anima-0001.json reference: 60:45 is a
    // stale CLIPLoader superseded by 60:61, and nothing links from it.
    const wf: ComfyUIWorkflow = {
      "60:45": { class_type: "CLIPLoader", inputs: { clip_name: "old.gguf", }, },
      "60:61": { class_type: "CLIPLoaderGGUF", inputs: { clip_name: "new.gguf", }, },
      "46": { class_type: "SaveImage", inputs: { clip: ["60:61", 0,], }, },
    };

    expect(findDeadNodes(wf,),).toEqual(["60:45",],);
  });

  it("reports every dead node, in iteration order", () => {
    const wf: ComfyUIWorkflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: {}, },
      "2": { class_type: "KSampler", inputs: { model: ["1", 0,], }, },
      "3": { class_type: "EmptyLatentImage", inputs: {}, },
      "4": { class_type: "LoraLoader", inputs: { model: ["1", 0,], }, },
      "5": { class_type: "SaveImage", inputs: { images: ["2", 0,], }, },
    };

    // 3 and 4 are consumed by nobody and are not sinks.
    expect(findDeadNodes(wf,),).toEqual(["3", "4",],);
  });

  it("treats every known sink class as terminal", () => {
    for (const classType of ["SaveImage", "PreviewImage", "Note", "SaveVideo",]) {
      const wf: ComfyUIWorkflow = { "9": { class_type: classType, inputs: {}, }, };
      expect(findDeadNodes(wf,),).toEqual([],);
    }
  });

  it("resolves a link by its first element regardless of slot count", () => {
    const wf: ComfyUIWorkflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: {}, },
      "2": { class_type: "KSampler", inputs: { model: ["1", 0,], latent: ["1", 2,], }, },
      "3": { class_type: "SaveImage", inputs: { images: ["2", 0,], }, },
    };

    expect(findDeadNodes(wf,),).toEqual([],);
  });

  it("does not treat a plain string or a lone array as a link", () => {
    // `batch_size: 1` and `sampler: "euler"` must not be mistaken for links,
    // and `steps: [1, 2]` is not [nodeId, slot] because element 0 is a number.
    // Node 1 is dead because nothing consumes it — the point is that its own
    // non-link inputs must not make it look referenced.
    const wf: ComfyUIWorkflow = {
      "1": { class_type: "KSampler", inputs: { batch_size: 1, sampler: "euler", steps: [1, 2,], }, },
    };

    expect(findDeadNodes(wf,),).toEqual(["1",],);
  });

  it("returns nothing for an empty graph", () => {
    expect(findDeadNodes({},),).toEqual([],);
  });
});
