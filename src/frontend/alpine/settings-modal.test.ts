// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

type Globals = {
  apiFetch?: (url: string, init?: RequestInit,) => Promise<Response>;
  localStorage?: { getItem(key: string,): string | null; setItem(key: string, value: string,): void };
  settingsModal?: () => {
    load(): Promise<void>;
    save(section: string,): Promise<void>;
    saveComfyModels(): Promise<void>;
    comfyModels: {
      provider: string;
      noVae: boolean;
      clipRole: { selected: string | null };
      diffusionRole: { selected: string | null };
      vaeRole: { selected: string | null };
    } | null;
  };
};

const globals = globalThis as Globals;
const originalFetch = globals.apiFetch;
const originalStorage = globals.localStorage;
let calls: Array<{ url: string; init?: RequestInit }>;

let modalFactory: NonNullable<Globals["settingsModal"]> | undefined;

beforeEach(async () => {
  calls = [];
  globals.localStorage = { getItem: () => null, setItem: () => {}, };
  if (modalFactory) {
    globals.settingsModal = modalFactory;
  } else {
    globals.settingsModal = undefined;
  }

  await import("./settings-modal");
  modalFactory ??= globals.settingsModal;
  globals.settingsModal = modalFactory;
  globals.apiFetch = async (url, init,) => {
    calls.push({ url, init, },);
    if (url.includes("/comfyui/models",)) {
      return Response.json({
        provider: "h3-local",
        noVae: false,
        clipRole: { candidates: ["clip.safetensors",], selected: "clip.safetensors", source: "discovery", },
        diffusionRole: { candidates: ["h3.gguf",], selected: "h3.gguf", source: "discovery", },
        vaeRole: { candidates: [], selected: null, source: "none", },
      },);
    }

    return Response.json({},);
  };
},);

afterEach(() => {
  globals.apiFetch = originalFetch;
  globals.localStorage = originalStorage;
},);

describe("settingsModal ComfyUI model selector", () => {
  test("loads candidates and persists the user choice by provider", async () => {
    const state = globals.settingsModal!();
    await state.load();
    expect(state.comfyModels?.provider,).toBe("h3-local",);
    state.comfyModels!.vaeRole.selected = null;
    state.comfyModels!.noVae = true;

    await state.saveComfyModels();
    const patch = calls.find((call,) => call.url === "/api/v1/settings" && call.init?.method === "PATCH");
    expect(patch,).toBeDefined();
    const body = JSON.parse(String(patch!.init!.body,),) as {
      comfyUiModels: Record<string, Record<string, unknown>>;
    };

    expect(body.comfyUiModels["h3-local"],).toEqual({
      noVae: true,
      clip: "clip.safetensors",
      diffusion: "h3.gguf",
    },);
  });

  test("save persists the theme, chat, and api sections", async () => {
    const state = globals.settingsModal!();
    await state.load();
    await state.save("theme",);
    await state.save("chat",);
    await state.save("api",);
    const patches = calls.filter(
      (call,) => call.url === "/api/v1/settings" && call.init?.method === "PATCH",
    );

    expect(patches.length,).toBe(3,);
    expect(JSON.parse(String(patches[0]!.init!.body,),),).toHaveProperty("theme",);
    expect(JSON.parse(String(patches[1]!.init!.body,),),).toHaveProperty("detailLevel",);
    expect(JSON.parse(String(patches[2]!.init!.body,),),).toHaveProperty("provider",);
  });

  test("loadComfyModels leaves the selector hidden when the engine is down", async () => {
    globals.apiFetch = async (url,) => {
      if (url.includes("/comfyui/models",)) {
        return new Response("unavailable", { status: 500, },);
      }

      return Response.json({},);
    };

    const state = globals.settingsModal!();
    await state.load();
    expect(state.comfyModels,).toBeNull();
  });

  test("load ignores fetch failures", async () => {
    globals.apiFetch = async () => {
      throw new Error("offline",);
    };

    const state = globals.settingsModal!();
    await state.load();
    expect(state.comfyModels,).toBeNull();
  });
});
