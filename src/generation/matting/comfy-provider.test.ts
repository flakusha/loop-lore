// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI matting provider tests - native RemoveBackground workflow:
 * node capability check, upload -> prompt -> history -> view round trip,
 * and workflow shape (model plumbed into LoadBackgroundRemovalModel).
 */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import type { ComfyUIClient, } from "../providers/comfyui";
import {
  buildMattingWorkflow,
  createComfyMattingProvider,
  hasMattingNodes,
  MATTING_REQUIRED_NODES,
} from "./comfy-provider";

createLogger({ level: "error", },);

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3,],);

interface RunCapture {
  uploadedName: string | null;
  workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> | null;
}

function fakeClient(
  nodeInfo: Record<string, unknown>,
  capture: RunCapture,
): ComfyUIClient {
  return {
    baseUrl: "http://127.0.0.1:8188",
    getNodeInfo: async () => nodeInfo,
    uploadImage: async (_buffer: Buffer, filename: string,) => {
      capture.uploadedName = filename;
      return "matting-in.png";
    },
    runWorkflow: async (
      workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>,
    ) => {
      capture.workflow = workflow;
      return [PNG.buffer as ArrayBuffer,];
    },
  } as unknown as ComfyUIClient;
}

const nodeInfoFixture = Object.fromEntries(
  MATTING_REQUIRED_NODES.map((n,) => [n, {},]),
);

describe("hasMattingNodes", () => {
  test("true when every required node is installed", () => {
    expect(hasMattingNodes(nodeInfoFixture,),).toBe(true,);
  });

  test("false when RemoveBackground is missing", () => {
    const info = { ...nodeInfoFixture, };
    delete (info as Record<string, unknown>).RemoveBackground;
    expect(hasMattingNodes(info,),).toBe(false,);
  });
});

describe("buildMattingWorkflow", () => {
  test("wires LoadImage -> RemoveBackground -> SaveImage with the model", () => {
    const wf = buildMattingWorkflow("in.png", "birefnet.safetensors",);
    const byClass = new Map(Object.values(wf,).map((n,) => [n.class_type, n,]),);
    expect(byClass.get("LoadBackgroundRemovalModel",)?.inputs,).toMatchObject({
      bg_removal_name: "birefnet.safetensors",
    },);
    expect(byClass.get("RemoveBackground",)?.inputs,).toMatchObject({
      image: ["1", 0,],
      bg_removal_model: ["2", 0,],
    },);
    expect(byClass.get("SaveImage",)?.inputs,).toMatchObject({ images: ["5", 0,], },);
  });
});

describe("createComfyMattingProvider", () => {
  test("runs the workflow end-to-end and returns PNG bytes", async () => {
    const capture: RunCapture = { uploadedName: null, workflow: null, };
    const provider = createComfyMattingProvider({
      client: fakeClient(nodeInfoFixture, capture,),
      model: "birefnet.safetensors",
    },);

    const out = await provider.removeBackground(Buffer.from([1, 2, 3,],),);

    expect(out.subarray(0, 4,),).toEqual(Buffer.from([137, 80, 78, 71,],),);
    expect(provider.name,).toBe("comfy:birefnet.safetensors",);
    expect(capture.uploadedName,).toContain("matting-",);
    const nodes = Object.values(capture.workflow ?? {},);
    const load = nodes.find((n,) => n.class_type === "LoadImage");
    expect(load?.inputs,).toMatchObject({ image: "matting-in.png", },);
    const model = nodes.find((n,) => n.class_type === "LoadBackgroundRemovalModel");
    expect(model?.inputs,).toMatchObject({ bg_removal_name: "birefnet.safetensors", },);
  });

  test("degrades to a job failure when ComfyUI lacks the nodes", async () => {
    const info = { ...nodeInfoFixture, };
    delete (info as Record<string, unknown>).InvertMask;
    const provider = createComfyMattingProvider({
      client: fakeClient(info, { uploadedName: null, workflow: null, },),
    },);
    await expect(provider.removeBackground(Buffer.from([1,],),),).rejects.toThrow(
      "missing the background-removal nodes",
    );
  });
});
