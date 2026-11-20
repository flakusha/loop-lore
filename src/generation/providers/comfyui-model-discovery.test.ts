// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createLogger, } from "@loop-lore/core/logger";
import { beforeAll, describe, expect, test, } from "bun:test";
import {
  assertComfyUIModelName,
  COMFYUI_MODEL_EXTENSIONS,
  COMFYUI_MODEL_FOLDERS,
  COMFYUI_MODEL_ROLES,
  type ComfyUIModelCandidates,
  type ComfyUIModelClient,
  discoverComfyUIModels,
  filterComfyUIModelNames,
  hasComfyUIModelExtension,
  resolveComfyUIModels,
} from "./comfyui-model-discovery";

const discovered: ComfyUIModelCandidates = {
  clip: ["clip-b.safetensors", "clip-a.safetensors",],
  diffusion: ["unet-a.safetensors",],
  vae: ["vae-a.safetensors", "vae-b.bin",],
  checkpoint: ["base.ckpt",],
  clip_vision: ["vision-a.safetensors",],
  loras: ["style-a.safetensors",],
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

  test("registry keys supply checkpoint, clip_vision and loras candidates", async () => {
    const client: ComfyUIModelClient = {
      async listModelFolders() {
        return ["checkpoints", "clip_vision", "loras",];
      },
      async listModelFolder(folder,) {
        if (folder === "checkpoints") { return ["base.ckpt",]; }
        if (folder === "clip_vision") { return ["vision-a.safetensors", "notes.json",]; }
        return ["style-b.safetensors",];
      },
    };

    const result = await discoverComfyUIModels(client,);
    expect(result.checkpoint,).toEqual(["base.ckpt",],);
    expect(result.clip_vision,).toEqual(["vision-a.safetensors",],);
    expect(result.loras,).toEqual(["style-b.safetensors",],);
  });

  test("/object_info COMBO options win over folder aliases", async () => {
    const listed: string[] = [];
    const client: ComfyUIModelClient = {
      async listModelFolders() {
        return ["checkpoints", "clip_vision", "loras",];
      },
      async listModelFolder(folder,) {
        listed.push(folder,);
        return ["alias.safetensors",];
      },
      async getNodeInfo() {
        return {
          CLIPVisionLoader: {
            input: { required: { clip_name: ["COMBO", { options: ["vision-live.safetensors",], },], }, },
          },
          LoraLoader: {
            input: { required: { lora_name: [["style-live.safetensors",], {},], }, },
          },
          CheckpointLoaderSimple: {
            input: { required: { ckpt_name: ["COMBO",], }, },
          },
        };
      },
    };

    const result = await discoverComfyUIModels(client,);
    expect(result.clip_vision,).toEqual(["vision-live.safetensors",],);
    expect(result.loras,).toEqual(["style-live.safetensors",],);
    // A bare COMBO carries no names, so the exact registry folder is listed.
    expect(result.checkpoint,).toEqual(["alias.safetensors",],);
    expect(listed,).toEqual(["checkpoints",],);
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

  test("image roles follow the same user/admin/config/discovery precedence", () => {
    const result = resolveComfyUIModels({
      discovered,
      config: { checkpoint: "base.ckpt", },
      admin: { loras: "style-a.safetensors", },
      user: { clip_vision: "vision-a.safetensors", loras: "stale.safetensors", },
    },);

    expect(result.checkpointRole,).toEqual({
      candidates: discovered.checkpoint,
      selected: "base.ckpt",
      source: "config",
    },);

    expect(result.clipVisionRole.selected,).toBe("vision-a.safetensors",);
    expect(result.clipVisionRole.source,).toBe("user",);
    expect(result.lorasRole.selected,).toBe("style-a.safetensors",);
    expect(result.lorasRole.source,).toBe("admin",);
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

describe("catalog constants", () => {
  test("roles cover every folder map key", () => {
    expect([...COMFYUI_MODEL_ROLES,],).toEqual([
      "clip",
      "diffusion",
      "vae",
      "checkpoint",
      "clip_vision",
      "loras",
    ],);

    expect(Object.keys(COMFYUI_MODEL_FOLDERS,).sort(),).toEqual([...COMFYUI_MODEL_ROLES,].sort(),);
  });

  test("re-exported extensions match the core provider schema", () => {
    expect(COMFYUI_MODEL_EXTENSIONS.clip,).toContain(".safetensors",);
    expect(COMFYUI_MODEL_EXTENSIONS.diffusion,).toContain(".ckpt",);
  });

  test("hasComfyUIModelExtension accepts role extensions, rejects others", () => {
    expect(hasComfyUIModelExtension("clip", "enc.gguf",),).toBe(true,);
    expect(hasComfyUIModelExtension("clip", "vae.bin",),).toBe(false,);
  });
});
