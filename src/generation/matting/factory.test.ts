// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting provider factory tests - backend resolution matrix over the
 * `generation.matting` config section. Pure construction: no network.
 */
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import { resolveMattingProvider, } from "./factory";

/** Minimal config cast - factory only reads generation.matting + sd providers. */
function makeConfig(
  matting: Record<string, unknown> | undefined,
  sdProviders: Array<Record<string, unknown>> = [],
): Config {
  return {
    generation: { matting, providers: { sd: sdProviders, }, },
  } as unknown as Config;
}

const comfyProvider = {
  name: "comfy",
  apiFamily: "comfyui",
  baseUrl: "http://127.0.0.1:8188",
  models: { edit: ["qwen-image-edit",], },
};

describe("resolveMattingProvider", () => {
  test("returns null when the section is absent or backend none", () => {
    expect(resolveMattingProvider(makeConfig(undefined,),),).toBeNull();
    expect(
      resolveMattingProvider(makeConfig({ backend: "none", endpoint: "http://x", },),),
    ).toBeNull();
  });

  test("explicit rembg backend builds the rembg provider", () => {
    const provider = resolveMattingProvider(
      makeConfig({ backend: "rembg", endpoint: "http://127.0.0.1:7000", model: "isnet", },),
    );
    expect(provider?.name,).toBe("rembg:isnet",);
  });

  test("explicit http backend builds the generic provider", () => {
    const provider = resolveMattingProvider(
      makeConfig({ backend: "http", endpoint: "http://127.0.0.1:9000/mat", },),
    );
    expect(provider?.name,).toBe("http",);
  });

  test("auto prefers comfy when a comfyui sd provider exists", () => {
    const provider = resolveMattingProvider(
      makeConfig(
        { backend: "auto", },
        [comfyProvider, { name: "llama", apiFamily: "sdcpp", endpoint: "http://x", },],
      ),
    );
    expect(provider?.name,).toBe("comfy:birefnet.safetensors",);
  });

  test("auto falls back to rembg, then http, then null", () => {
    const rembg = resolveMattingProvider(
      makeConfig({ backend: "auto", endpoint: "http://r", model: "isnet", },),
    );
    expect(rembg?.name,).toBe("rembg:isnet",);

    const http = resolveMattingProvider(
      makeConfig({ backend: "auto", endpoint: "http://e", },),
    );
    expect(http?.name,).toBe("http",);

    expect(resolveMattingProvider(makeConfig({ backend: "auto", },),),).toBeNull();
  });

  test("comfy backend without a comfyui sd provider is null", () => {
    expect(
      resolveMattingProvider(makeConfig({ backend: "comfy", },),),
    ).toBeNull();
  });
});
