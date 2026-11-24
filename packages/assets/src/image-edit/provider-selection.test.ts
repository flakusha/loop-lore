// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Provider selection: the shipped gate and template shape are the only inputs. */
import { describe, expect, it, } from "bun:test";
import {
  createHonkboxEditProvider,
  honkboxProbeForImgEdit,
  isHonkboxEditCompatible,
  shouldUseHonkbox,
} from "./provider-selection";
import type { WorkflowTemplate, } from "./types";

const template: WorkflowTemplate = {
  id: `selection-${crypto.randomUUID()}`,
  name: "Selection Fixture",
  description: "pure fixture",
  category: "inpaint",
  backends: ["comfyui",],
  required_nodes: [],
  parameters: [{ name: "image", type: "image", label: "Image", default: "", required: true, },],
  build: () => ({}),
};

describe("image-edit provider selection", () => {
  it("recognizes only ComfyUI image templates honkbox can edit", () => {
    expect(isHonkboxEditCompatible(template,),).toBe(true,);
    expect(isHonkboxEditCompatible({ ...template, category: "upscale", },),).toBe(false,);
    expect(isHonkboxEditCompatible({ ...template, backends: ["sd-server",], },),).toBe(false,);
    expect(isHonkboxEditCompatible({ ...template, parameters: [], },),).toBe(false,);
    expect(shouldUseHonkbox(undefined, template,),).toBe(false,);
  });

  it("builds a honkbox adapter only for a usable probe", async () => {
    const withOps = {
      ok: true,
      capabilities: {
        apiVersion: "v1",
        server: { name: "honkbox", version: "0.9.0", },
        features: {
          vision: { built: false, models: 0, },
          controlnet: { available: false, models: 0, },
          lora: true,
          video: false,
          jobs: false,
          events: false,
          vad: false,
          experimentalAshSd: false,
          blender: false,
          artifactDelivery: false,
        },
        formats: {
          read: ["png",],
          write: [],
          limits: { outputCompression: { min: 0, max: 100, appliesTo: "jpeg", }, bodyBytes: 1, },
        },
        auth: { mode: "bearer", },
        queue: { gpuSlots: 1, queueWaitSecs: 1, retryAfterSecs: 1, kinds: [], },
        imageOps: { ops: ["edits",], },
        storage: { dataDirPresent: true, },
        openapi: "/v1/openapi.json",
        models: "/v1/models",
      },
      supported: true,
      latencyMs: 0,
    } as const;

    const provider = createHonkboxEditProvider(withOps,);
    expect(provider.name,).toBe("honkbox",);
    expect(await provider.healthCheck(),).toBe(true,);
    expect(await createHonkboxEditProvider(undefined,).healthCheck(),).toBe(false,);
    expect(shouldUseHonkbox(withOps, template,),).toBe(true,);
  });

  it("does not probe when HONKBOX_BASE_URL is unset", async () => {
    const original = process.env.HONKBOX_BASE_URL;
    try {
      delete process.env.HONKBOX_BASE_URL;
      expect(await honkboxProbeForImgEdit(),).toBeUndefined();
    } finally {
      if (original === undefined) { delete process.env.HONKBOX_BASE_URL; }
      else {
        process.env.HONKBOX_BASE_URL = original;
      }
    }
  });
});
