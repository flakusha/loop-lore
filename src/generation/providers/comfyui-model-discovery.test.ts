// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createLogger, } from "@loop-lore/core/logger";
import { beforeAll, describe, expect, test, } from "bun:test";
import {
  assertComfyUIModelName,
  type ComfyUIModelCandidates,
  type ComfyUIModelClient,
  discoverComfyUIModels,
  filterComfyUIModelNames,
  resolveComfyUIModels,
} from "./comfyui-model-discovery";

const discovered: ComfyUIModelCandidates = {
  clip: ["clip-b.safetensors", "clip-a.safetensors",],
  diffusion: ["unet-a.safetensors",],
  vae: ["vae-a.safetensors", "vae-b.bin",],
};

beforeAll(() => {
  try {
    createLogger({ level: "error", },);
  } catch { /* already initialized */ }
},);

describe("filterComfyUIModelNames", () => {
  test("keeps role-compatible extensions, dedupes and sorts", () => {
    expect(filterComfyUIModelNames("clip", [
      "b.gguf",
      "a.safetensors",
      "b.gguf",
      "notes.json",
      "c.SAFETENSORS",
    ],),).toEqual(["a.safetensors", "b.gguf", "c.SAFETENSORS",],);
  });

  test("rejects a VAE extension in the clip slot", () => {
    expect(filterComfyUIModelNames("clip", ["vae.bin",],),).toEqual([],);
  });
});

describe("assertComfyUIModelName", () => {
  test("throws with the expected extensions", () => {
    expect(() => assertComfyUIModelName("diffusion", "clip.gguf",)).not.toThrow();
    expect(() => assertComfyUIModelName("clip", "model.json",)).toThrow(/expected/,);
  });
});

describe("discoverComfyUIModels", () => {
  test("unions folder aliases and skips unavailable folders", async () => {
    const client: ComfyUIModelClient = {
      async listModelFolders() {
        return ["clip", "clip_gguf", "diffusion_models", "vae",];
      },
      async listModelFolder(folder,) {
        if (folder === "clip_gguf") { throw new Error("404",); }
        if (folder === "clip") { return ["clip-a.safetensors", "bad.json",]; }
        if (folder === "diffusion_models") { return ["unet-a.safetensors",]; }
        return ["vae-a.safetensors",];
      },
    };

    const result = await discoverComfyUIModels(client,);
    expect(result.clip,).toEqual(["clip-a.safetensors",],);
    expect(result.diffusion,).toEqual(["unet-a.safetensors",],);
    expect(result.vae,).toEqual(["vae-a.safetensors",],);
  });
});

describe("resolveComfyUIModels", () => {
  test("user choice wins, then admin, then config, then discovery", () => {
    const user = resolveComfyUIModels({
      discovered,
      config: { diffusion: "pinned.safetensors", },
      admin: { diffusion: "admin.safetensors", },
      user: { clip: "clip-a.safetensors", diffusion: "stale.safetensors", },
    },);

    expect(user.clipRole,).toEqual({
      candidates: discovered.clip,
      selected: "clip-a.safetensors",
      source: "user",
    },);

    expect(user.diffusionRole.selected,).toBe("admin.safetensors",);
    expect(user.diffusionRole.source,).toBe("admin",);
    expect(user.vaeRole.selected,).toBe("vae-a.safetensors",);
    expect(user.vaeRole.source,).toBe("discovery",);

    const pinned = resolveComfyUIModels({
      discovered,
      config: { diffusion: "pinned.safetensors", },
    },);

    expect(pinned.diffusionRole,).toEqual({
      candidates: discovered.diffusion,
      selected: "pinned.safetensors",
      source: "config",
    },);
  });

  test("noVae skips VAE selection and reports none", () => {
    const result = resolveComfyUIModels({ discovered, config: { noVae: true, }, },);
    expect(result.noVae,).toBe(true,);
    expect(result.vaeRole,).toEqual({ candidates: [], selected: null, source: "none", },);
  });

  test("rejects an incompatible config pin", () => {
    expect(() =>
      resolveComfyUIModels({
        discovered,
        config: { clip: "clip.json", },
      },)
    ).toThrow(/Invalid ComfyUI clip model/,);
  });
});
