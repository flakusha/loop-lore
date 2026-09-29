// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Tests for the sd-server provider ops (txt2img / img2img / upscale).
 *
 * The real family modules run end-to-end; only globalThis.fetch is mocked
 * (pattern from src/utils/safe-fetch/fetch.test.ts), so parameter mapping,
 * defaults, emotion modifiers, and family dispatch are all exercised.
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import type { ImageProviderConfig, } from "../../../config/schema";
import { ImageApiFamily, } from "../../../db/enums-config";
import type { ImageEditProgress, } from "../../types";
import { executeImg2Img, executeTxt2Img, executeUpscale, } from "./ops";
import type { SDServerHost, } from "./types";

const originalFetch = globalThis.fetch;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

afterEach(() => {
  (globalThis as Record<string, unknown>).fetch = originalFetch;
},);

/**
 * Run fn with globalThis.fetch swapped for a recording mock (codebase pattern).
 * @param handler
 * @param fn
 */
async function withMockFetch(
  handler: (url: string, init?: RequestInit,) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<FetchCall[]> {
  const calls: FetchCall[] = [];
  (globalThis as Record<string, unknown>).fetch = mock((url: string, init?: RequestInit,) => {
    calls.push({ url, init, },);
    return handler(url, init,);
  },) as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
  return calls;
}

/** Parse the JSON body safeFetch serialized for a recorded call. */
function bodyOf(call: FetchCall,): Record<string, unknown> {
  return JSON.parse(String(call.init?.body ?? "{}",),) as Record<string, unknown>;
}

function makeCfg(): ImageProviderConfig {
  return {
    name: "test-sd",
    label: "Test SD",
    baseUrl: "http://sdserver.test",
    apiFamily: ImageApiFamily.Sdcpp,
    defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    timeout: 30_000,
    generationTimeout: 120_000,
  };
}

function makeHost(family: ImageApiFamily,): SDServerHost {
  return { baseUrl: "http://sdserver.test", apiFamily: family, getConfig: () => null, };
}

/** sdcpp job flow: POST returns a job id, GET polls to done. */
function sdcppJobFlow(images: string[] = ["b64a",],): (url: string, init?: RequestInit,) => Response {
  return (_url, init,) =>
    init?.method === "POST"
      ? Response.json({ id: "job-1", },)
      : Response.json({ status: "done", images, },);
}

describe("executeTxt2Img", () => {
  test("sdcpp family: applies cfg defaults and maps poll results", async () => {
    const progress: ImageEditProgress[] = [];
    const calls = await withMockFetch(
      sdcppJobFlow(),
      async () => {
        const results = await executeTxt2Img(makeHost(ImageApiFamily.Sdcpp,), {}, makeCfg(), (p,) => {
          progress.push(p,);
        },);
        expect(results,).toHaveLength(1,);
        expect(results[0]!.filename,).toMatch(/^sdserver-[0-9a-f]{8}-0\.png$/,);
        expect(results[0]!.url,).toBe(`/api/assets/${results[0]!.id}/raw`,);
        expect(results[0]!.mimeType,).toBe("image/png",);
      },
    );
    expect(calls[0]!.url,).toBe("http://sdserver.test/sdcpp/v1/txt2img",);
    const body = bodyOf(calls[0]!,);
    expect(body.prompt,).toBe("",);
    expect(body.negative_prompt,).toBe("",);
    expect(body.width,).toBe(512,);
    expect(body.height,).toBe(512,);
    expect(body.steps,).toBe(20,);
    expect(body.cfg_scale,).toBe(7,);
    expect(body.sampler,).toBe("euler",);
    expect(body.seed,).toBe(-1,);
    expect(body.batch_size,).toBe(1,);
    expect(body.output_format,).toBe("png",);
    expect(progress[0],).toEqual({ status: "running", message: "Generating image...", },);
  });

  test("explicit params override cfg defaults", async () => {
    const calls = await withMockFetch(
      sdcppJobFlow(),
      async () => {
        await executeTxt2Img(makeHost(ImageApiFamily.Sdcpp,), {
          prompt: "a cat",
          negative_prompt: "blurry",
          width: 1024,
          height: 768,
          steps: 40,
          cfg_scale: 9,
          sampler: "dpmpp_2m",
          seed: 12345,
        }, makeCfg(),);
      },
    );
    const body = bodyOf(calls[0]!,);
    expect(body.prompt,).toBe("a cat",);
    expect(body.negative_prompt,).toBe("blurry",);
    expect(body.width,).toBe(1024,);
    expect(body.height,).toBe(768,);
    expect(body.steps,).toBe(40,);
    expect(body.cfg_scale,).toBe(9,);
    expect(body.sampler,).toBe("dpmpp_2m",);
    expect(body.seed,).toBe(12345,);
  });

  test("appends the emotion modifier to the prompt", async () => {
    const calls = await withMockFetch(
      sdcppJobFlow(),
      async () => {
        await executeTxt2Img(makeHost(ImageApiFamily.Sdcpp,), {
          prompt: "a cat",
          emotion: "happy",
        }, makeCfg(),);
      },
    );
    expect(bodyOf(calls[0]!,).prompt,).toBe("a cat, happy expression, smiling, bright eyes, cheerful",);
  });

  test("leaves the prompt unchanged for an unknown emotion", async () => {
    const calls = await withMockFetch(
      sdcppJobFlow(),
      async () => {
        await executeTxt2Img(makeHost(ImageApiFamily.Sdcpp,), {
          prompt: "a cat",
          emotion: "furious",
        }, makeCfg(),);
      },
    );
    expect(bodyOf(calls[0]!,).prompt,).toBe("a cat",);
  });

  test("leaves the prompt unchanged when no emotion is given", async () => {
    const calls = await withMockFetch(
      sdcppJobFlow(),
      async () => {
        await executeTxt2Img(makeHost(ImageApiFamily.Sdcpp,), { prompt: "a cat", }, makeCfg(),);
      },
    );
    expect(bodyOf(calls[0]!,).prompt,).toBe("a cat",);
  });

  test("sdapi family: posts to sdapi with sampler_name and no output_format", async () => {
    const calls = await withMockFetch(
      () => Response.json({ images: ["b64a", "b64b",], },),
      async () => {
        const results = await executeTxt2Img(makeHost(ImageApiFamily.Sdapi,), {}, makeCfg(),);
        expect(results,).toHaveLength(2,);
        expect(results[0]!.filename,).toMatch(/^sdapi-[0-9a-f]{8}-0\.png$/,);
      },
    );
    expect(calls[0]!.url,).toBe("http://sdserver.test/sdapi/v1/txt2img",);
    const body = bodyOf(calls[0]!,);
    expect(body.sampler_name,).toBe("euler",);
    expect(body.batch_size,).toBe(1,);
    expect("output_format" in body,).toBe(false,);
  });

  test("openai family: posts size and n to the generations endpoint", async () => {
    const calls = await withMockFetch(
      () => Response.json({ data: [{ b64_json: "x", }, { b64_json: "y", },], },),
      async () => {
        const results = await executeTxt2Img(makeHost(ImageApiFamily.Openai,), {
          prompt: "a dog",
          width: 1024,
          height: 768,
        }, makeCfg(),);
        expect(results,).toHaveLength(2,);
        expect(results[0]!.filename,).toMatch(/^openai-[0-9a-f]{8}-0\.png$/,);
        expect(results[0]!.url,).toBe(`/api/assets/${results[0]!.id}/raw`,);
      },
    );
    expect(calls[0]!.url,).toBe("http://sdserver.test/v1/images/generations",);
    const body = bodyOf(calls[0]!,);
    expect(body.prompt,).toBe("a dog",);
    expect(body.n,).toBe(1,);
    expect(body.size,).toBe("1024x768",);
    expect(body.output_format,).toBe("png",);
  });
});

describe("executeImg2Img", () => {
  test("sdcpp family: defaults denoise to 0.75 and submits init_image", async () => {
    const progress: ImageEditProgress[] = [];
    const calls = await withMockFetch(
      sdcppJobFlow(),
      async () => {
        await executeImg2Img(makeHost(ImageApiFamily.Sdcpp,), { input_image: "b64src", }, makeCfg(), (p,) => {
          progress.push(p,);
        },);
      },
    );
    expect(calls[0]!.url,).toBe("http://sdserver.test/sdcpp/v1/img2img",);
    const body = bodyOf(calls[0]!,);
    expect(body.init_image,).toBe("b64src",);
    expect(body.denoising_strength,).toBe(0.75,);
    expect(body.batch_size,).toBe(1,);
    expect(body.output_format,).toBe("png",);
    expect(progress[0],).toEqual({ status: "running", message: "Transforming image...", },);
  });

  test("explicit denoise_strength overrides the default", async () => {
    const calls = await withMockFetch(
      sdcppJobFlow(),
      async () => {
        await executeImg2Img(makeHost(ImageApiFamily.Sdcpp,), {
          input_image: "b64src",
          denoise_strength: 0.5,
        }, makeCfg(),);
      },
    );
    expect(bodyOf(calls[0]!,).denoising_strength,).toBe(0.5,);
  });

  test("sdapi family: wraps the input image in init_images", async () => {
    const calls = await withMockFetch(
      () => Response.json({ images: ["b64out",], },),
      async () => {
        await executeImg2Img(makeHost(ImageApiFamily.Sdapi,), { input_image: "b64src", }, makeCfg(),);
      },
    );
    expect(calls[0]!.url,).toBe("http://sdserver.test/sdapi/v1/img2img",);
    const body = bodyOf(calls[0]!,);
    expect(body.init_images,).toEqual(["b64src",],);
    expect(body.denoising_strength,).toBe(0.75,);
  });

  test("openai family: rejects img2img without network access", async () => {
    const calls = await withMockFetch(
      () => Response.json({ data: [], },),
      async () => {
        await expect(executeImg2Img(makeHost(ImageApiFamily.Openai,), { input_image: "x", }, makeCfg(),),).rejects
          .toThrow(
            "img2img not supported with OpenAI API family",
          );
      },
    );
    expect(calls,).toHaveLength(0,);
  });
});

describe("executeUpscale", () => {
  test("sdapi family: defaults the upscale model and maps the single result", async () => {
    const progress: ImageEditProgress[] = [];
    const calls = await withMockFetch(
      () => Response.json({ image: "b64out", },),
      async () => {
        const results = await executeUpscale(makeHost(ImageApiFamily.Sdapi,), { input_image: "b64src", }, (p,) => {
          progress.push(p,);
        },);
        expect(results,).toHaveLength(1,);
        expect(results[0]!.filename,).toMatch(/^upscaled-[0-9a-f]{8}\.png$/,);
        expect(results[0]!.url,).toBe(`/api/assets/${results[0]!.id}/raw`,);
        expect(results[0]!.mimeType,).toBe("image/png",);
      },
    );
    expect(calls[0]!.url,).toBe("http://sdserver.test/sdapi/v1/extra-single-image",);
    const body = bodyOf(calls[0]!,);
    expect(body.image,).toBe("b64src",);
    expect(body.upscale_model,).toBe("RealESRGAN_x4plus",);
    expect(progress[0],).toEqual({ status: "running", message: "Upscaling image...", },);
  });

  test("honors a custom upscale_model", async () => {
    const calls = await withMockFetch(
      () => Response.json({ image: "b64out", },),
      async () => {
        await executeUpscale(makeHost(ImageApiFamily.Sdapi,), {
          input_image: "b64src",
          upscale_model: "ESRGAN",
        },);
      },
    );
    expect(bodyOf(calls[0]!,).upscale_model,).toBe("ESRGAN",);
  });

  test("throws when the upscale call fails", async () => {
    await withMockFetch(
      () => Response.json({ error: "model missing", }, { status: 500, statusText: "Internal Server Error", },),
      async () => {
        await expect(executeUpscale(makeHost(ImageApiFamily.Sdapi,), { input_image: "b64src", },),).rejects.toThrow(
          "Upscale failed: HTTP 500: Internal Server Error",
        );
      },
    );
  });

  test("non-sdapi families reject upscale without network access", async () => {
    const calls = await withMockFetch(
      () => Response.json({ image: "b64out", },),
      async () => {
        await expect(executeUpscale(makeHost(ImageApiFamily.Sdcpp,), { input_image: "b64src", },),).rejects.toThrow(
          "Upscale not supported with sdcpp API family",
        );
      },
    );
    expect(calls,).toHaveLength(0,);
  });
});
