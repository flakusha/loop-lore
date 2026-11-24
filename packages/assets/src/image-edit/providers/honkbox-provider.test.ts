// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Payload parity with honkbox `routes/images_edit.rs:63-99,252`.
 * No sockets: the form builder is pure and the transport is injectable.
 */
import { describe, expect, it, } from "bun:test";
import { parseHonkboxCapabilities, } from "../../../../../src/integrations/honkbox";
import {
  buildHonkboxEditForm,
  HonkboxEditProvider,
} from "./honkbox-provider";

const png = (name: string,) =>
  new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, name.length,],),], { type: "image/png", },);

describe("buildHonkboxEditForm", () => {
  it("sends image + mask PNG parts and every documented sampling field", async () => {
    const image = png("source",);
    const mask = png("mask!",);
    const form = buildHonkboxEditForm({
      image,
      mask,
      params: {
        prompt: "make the sky dramatic",
        negative_prompt: "blurry, watermark",
        model: "sdxl",
        strength: 0.55,
        size: "1024x1024",
        sampler: "euler_a",
        scheduler: "karras",
        cfg_scale: 7.5,
        steps: 28,
        seed: 12345,
        output_format: "png",
        unknown_template_field: "ignored",
      },
    },);

    const imagePart = form.get("image",) as File;
    const maskPart = form.get("mask",) as File;
    expect(imagePart.name,).toBe("image.png",);
    expect(imagePart.type,).toBe("image/png",);
    expect(await imagePart.arrayBuffer(),).toEqual(await image.arrayBuffer(),);
    expect(maskPart.name,).toBe("mask.png",);
    expect(maskPart.type,).toBe("image/png",);
    expect(await maskPart.arrayBuffer(),).toEqual(await mask.arrayBuffer(),);

    expect(form.get("prompt",),).toBe("make the sky dramatic",);
    expect(form.get("negative_prompt",),).toBe("blurry, watermark",);
    expect(form.get("model",),).toBe("sdxl",);
    expect(form.get("strength",),).toBe("0.55",);
    expect(form.get("size",),).toBe("1024x1024",);
    expect(form.get("sampler",),).toBe("euler_a",);
    expect(form.get("scheduler",),).toBe("karras",);
    expect(form.get("cfg_scale",),).toBe("7.5",);
    expect(form.get("steps",),).toBe("28",);
    expect(form.get("seed",),).toBe("12345",);
    expect(form.get("output_format",),).toBe("png",);
    expect(form.has("unknown_template_field",),).toBe(false,);
  });

  it("maps LoRA path -> slug with strength for the honkbox catalog", () => {
    const form = buildHonkboxEditForm({
      image: png("source",),
      params: {
        prompt: "lora test",
        loras: [
          { path: "detail.tuner", strength: 0.75, },
          { slug: "style.sdxl", strength: 0.4, },
        ],
      },
    },);

    expect(JSON.parse(form.get("loras",) as string,),).toEqual([
      { slug: "detail.tuner", strength: 0.75, },
      { slug: "style.sdxl", strength: 0.4, },
    ],);
  });

  it("omits the mask part and empty scalars when not requested", () => {
    const form = buildHonkboxEditForm({ image: png("source",), params: { prompt: "", seed: 0, }, },);
    expect(form.has("mask",),).toBe(false,);
    expect(form.get("prompt",),).toBe("",);
    expect(form.get("seed",),).toBe("0",);
    expect(form.has("cfg_scale",),).toBe(false,);
    expect(form.has("loras",),).toBe(false,);
  });
});

describe("HonkboxEditProvider", () => {
  it("reports only the shipped imageOps gate as healthy", async () => {
    const caps = {
      api_version: "v1",
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
      storage: { dataDirPresent: true, },
      openapi: "/v1/openapi.json",
      models: "/v1/models",
    };

    const withOps = parseHonkboxCapabilities({ ...caps, image_ops: { ops: ["edits",], }, },);
    const withoutOps = parseHonkboxCapabilities(caps,);
    if (!withOps.ok || !withoutOps.ok) { throw new Error("test capability fixture rejected",); }

    const probe = (
      parsed: typeof withOps,
    ) => ({ ok: true, capabilities: parsed.capabilities, supported: true, latencyMs: 0, } as const);

    expect(
      await new HonkboxEditProvider({ baseUrl: "http://127.0.0.1:9010/v1", probe: probe(withOps,), },).healthCheck(),
    ).toBe(true,);

    expect(
      await new HonkboxEditProvider({ baseUrl: "http://127.0.0.1:9010/v1", probe: probe(withoutOps,), },).healthCheck(),
    ).toBe(false,);

    expect(await new HonkboxEditProvider({ baseUrl: "http://127.0.0.1:9010/v1", probe: undefined, },).healthCheck(),)
      .toBe(false,);
  });
});
