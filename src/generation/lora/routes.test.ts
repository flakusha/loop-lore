/**
 * Unit tests for LoRA routes URL resolution.
 *
 * The `resolveBackendUrls` helper maps a single `sd[]` provider array to
 * per-backend base URLs by `apiFamily`. This guards against the regression
 * where both comfyUrl and sdServerUrl collapsed to the same provider URL.
 */
import { describe, expect, it, } from "bun:test";
import type { Config, } from "../../config/schema";
import { resolveBackendUrls, } from "./routes";

/**
 * Minimal valid ImageProviderConfig for a given apiFamily + baseUrl.
 * @param apiFamily
 * @param baseUrl
 */
function provider(apiFamily: string, baseUrl: string,): Record<string, unknown> {
  return {
    name: `${apiFamily}-provider`,
    label: `${apiFamily} Provider`,
    baseUrl,
    apiFamily,
    defaults: { model: "default", steps: 20, width: 512, height: 512, },
    timeout: 10_000,
    generationTimeout: 60_000,
  };
}

/**
 * @param sd
 */
function configWithSd(sd: unknown[],): Config {
  return {
    generation: { providers: { sd: sd as never, }, },
  } as unknown as Config;
}

describe("resolveBackendUrls", () => {
  it("defaults to localhost when no SD providers configured", () => {
    const urls = resolveBackendUrls(configWithSd([],),);
    expect(urls.comfyUrl,).toBe("http://localhost:8188",);
    expect(urls.sdServerUrl,).toBe("http://localhost:9010",);
  });

  it("resolves comfyui and sdcpp to their own baseUrls", () => {
    const urls = resolveBackendUrls(
      configWithSd([
        provider("comfyui", "http://localhost:8288",),
        provider("sdcpp", "http://localhost:9320",),
      ],),
    );
    expect(urls.comfyUrl,).toBe("http://localhost:8288",);
    expect(urls.sdServerUrl,).toBe("http://localhost:9320",);
    expect(urls.comfyUrl,).not.toBe(urls.sdServerUrl,);
  });

  it("falls back per-backend when only one backend is configured", () => {
    const urls = resolveBackendUrls(
      configWithSd([provider("comfyui", "http://localhost:8288",),],),
    );
    expect(urls.comfyUrl,).toBe("http://localhost:8288",);
    expect(urls.sdServerUrl,).toBe("http://localhost:9010",);
  });

  it("handles undefined config", () => {
    const urls = resolveBackendUrls(undefined,);
    expect(urls.comfyUrl,).toBe("http://localhost:8188",);
    expect(urls.sdServerUrl,).toBe("http://localhost:9010",);
  });
});
