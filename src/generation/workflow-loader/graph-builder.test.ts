// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { Graph, } from "./graph-builder";
import { hasTerminalSink, isValidWorkflow, } from "./workflow-validation";

const FINISH = { embeddingKey: "graph", schemaId: "test-schema", } as const;

describe("Graph", () => {
  it("emits UI and API graphs that agree node-for-node, ending in a real sink", () => {
    const graph = new Graph();
    const loader = graph.add("CheckpointLoaderSimple", { ckpt_name: "base.safetensors", steps: 20, },);
    const sink = graph.add("SaveImage", {},);
    graph.wire(loader, 0, sink, "images",);

    const { workflow, prompt, } = graph.finish(FINISH,);

    expect(Object.keys(prompt,),).toEqual([loader, sink,],);
    expect(workflow.nodes,).toHaveLength(2,);
    expect(isValidWorkflow(prompt,),).toBe(true,);

    for (const [id, apiNode,] of Object.entries(prompt,)) {
      const uiNode = workflow.nodes?.find((node,) => node.id === id);
      expect(uiNode?.type,).toBe(apiNode.class_type,);
      expect(apiNode._meta,).toEqual({ title: apiNode.class_type, },);
    }

    const uiLoader = workflow.nodes?.find((node,) => node.id === loader);
    expect(uiLoader?.widgets_values_named,).toEqual({ ckpt_name: "base.safetensors", steps: 20, },);
    expect(uiLoader?.widgets_values,).toEqual(["base.safetensors", 20,],);
    expect(prompt[loader]?.inputs,).toEqual({ ckpt_name: "base.safetensors", steps: 20, },);

    const uiSink = workflow.nodes?.find((node,) => node.id === sink);
    expect(uiSink?.inputs,).toEqual([{ name: "images", type: "", link: 1, },],);
    expect(uiLoader?.outputs,).toEqual([{ name: "images", type: "", slot_index: 0, links: [1,], },],);
    expect(prompt[sink]?.inputs,).toEqual({ images: [loader, 0,], },);
    expect(workflow.links,).toEqual([[1, loader, 0, sink, expect.any(Number,), "",],],);
  });

  it("rejects a second binding to the same target input", () => {
    const graph = new Graph();
    const first = graph.add("NoopLoader", {},);
    const second = graph.add("NoopLoader", {},);
    const sink = graph.add("SaveImage", {},);
    graph.wire(first, 0, sink, "images",);

    expect(() => graph.wire(second, 0, sink, "images",)).toThrow();
    const secondSink = graph.add("SaveImage", {},);
    graph.wire(second, 0, secondSink, "images",);

    const { workflow, prompt, } = graph.finish(FINISH,);
    expect(workflow.links,).toHaveLength(2,);
    expect(prompt[sink]?.inputs,).toEqual({ images: [first, 0,], },);
  });

  it("allocates past reserved grouped ids without clobbering nodes already built", () => {
    const graph = new Graph({ reservedIds: ["60:45", "100", "101",], },);
    const first = graph.add("NoopLoader", {},);
    const second = graph.add("NoopLoader", {},);
    const firstSink = graph.add("SaveImage", {},);
    const secondSink = graph.add("SaveImage", {},);
    graph.wire(first, 0, firstSink, "images",);
    graph.wire(second, 0, secondSink, "images",);

    expect(first,).toBe("102",);
    expect(second,).toBe("103",);

    const { workflow, prompt, } = graph.finish(FINISH,);
    expect(Object.keys(prompt,).slice(0, 2,),).toEqual(["102", "103",],);
    expect(workflow.nodes?.map((node,) => node.id).slice(0, 2,),).toEqual(["102", "103",],);
  });

  it("embeds the prompt under the caller-named key only, with no model literals", () => {
    const graph = new Graph();
    const source = graph.add("NoopLoader", { seed: 7, },);
    const sink = graph.add("PreviewImage", {},);
    graph.wire(source, 0, sink, "images",);

    const { workflow, prompt, } = graph.finish({ embeddingKey: "customGraph", schemaId: "schema-42", },);
    const extra = workflow.extra as Record<string, { schema: string; executablePrompt: unknown }>;

    expect(Object.keys(extra,),).toEqual(["customGraph",],);
    expect(extra.customGraph!.schema,).toBe("schema-42",);
    expect(extra.customGraph!.executablePrompt,).toEqual(prompt,);
    expect(JSON.stringify({ workflow, prompt, },),).not.toMatch(/h3/i,);
  });

  it("keeps the embedded executablePrompt independent of the returned prompt", () => {
    const graph = new Graph();
    const loader = graph.add("CheckpointLoaderSimple", { ckpt_name: "base.safetensors", },);
    const sink = graph.add("SaveImage", {},);
    graph.wire(loader, 0, sink, "images",);

    const { workflow, prompt, } = graph.finish(FINISH,);
    const extra = workflow.extra as Record<string, { schema: string; executablePrompt: ComfyUIWorkflow }>;
    const embedded = extra[FINISH.embeddingKey]!.executablePrompt;

    prompt[loader]!.inputs.ckpt_name = "mutated.safetensors";
    expect(embedded[loader]!.inputs.ckpt_name,).toBe("base.safetensors",);

    embedded[loader]!.inputs.ckpt_name = "embedded.safetensors";
    expect(prompt[loader]!.inputs.ckpt_name,).toBe("mutated.safetensors",);
  });

  it("builds a valid graph from model-agnostic class types", () => {
    const graph = new Graph();
    const loader = graph.add("NoopLoader", { value: "agnostic", },);
    const preview = graph.add("PreviewImage", {},);
    graph.wire(loader, 0, preview, "images",);

    const { workflow, prompt, } = graph.finish(FINISH,);
    expect(Object.values(prompt,).map((node,) => node.class_type).sort(),).toEqual([
      "NoopLoader",
      "PreviewImage",
    ],);

    expect(workflow.nodes?.map((node,) => node.type).sort(),).toEqual(["NoopLoader", "PreviewImage",],);
    expect(hasTerminalSink(prompt,),).toBe(true,);
  });

  it("throws on an unknown wire endpoint and leaves the graph intact", () => {
    const graph = new Graph();
    const source = graph.add("NoopLoader", {},);
    const sink = graph.add("SaveImage", {},);

    expect(() => graph.wire("missing", 0, sink, "images",)).toThrow();
    expect(() => graph.wire(source, 0, "missing", "images",)).toThrow();
    expect(() => graph.finish(FINISH,)).toThrow(/dead node/,);

    graph.wire(source, 0, sink, "images",);
    const { workflow, prompt, } = graph.finish(FINISH,);
    expect(workflow.links,).toEqual([[1, source, 0, sink, expect.any(Number,), "",],],);
    expect(prompt[sink]?.inputs,).toEqual({ images: [source, 0,], },);
  });

  it("rejects an invalid finished graph through the shared gate", () => {
    const graph = new Graph();
    graph.add("NoopLoader", {},);

    expect(() => graph.finish(FINISH,)).toThrow(/no terminal sink/,);
  });
});
