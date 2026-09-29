// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Tests for the sd-server provider families (sdcpp / sdapi / openai).
 *
 * The HTTP layer is exercised through a mocked globalThis.fetch — the same
 * pattern as src/utils/safe-fetch/fetch.test.ts — so no network is touched.
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import type { ImageProviderConfig, } from "../../../config/schema";
import { ImageApiFamily, } from "../../../db/enums-config";
import type { ImageEditProgress, } from "../../types";
import { openaiGenerate, sdapiGenerate, sdcppGenerate, } from "./families";
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

function makeHost(
  family: ImageApiFamily = ImageApiFamily.Sdcpp,
  cfg: ImageProviderConfig | null = null,
): SDServerHost {
  return { baseUrl: "http://sdserver.test", apiFamily: family, getConfig: () => cfg, };
}

describe("sdcppGenerate", () => {
  test("submits the job, polls to completion, and maps images to results", async () => {
    const progress: ImageEditProgress[] = [];
    const calls = await withMockFetch(
      (_url, init,) =>
        init?.method === "POST"
          ? Response.json({ id: "job-42", },)
          : Response.json({ status: "done", images: ["b64a", "b64b",], },),
      async () => {
        const results = await sdcppGenerate(makeHost(), "txt2img", { prompt: "a cat", }, (p,) => {
          progress.push(p,);
        },);
        expect(results,).toHaveLength(2,);
        for (const [i, result,] of results.entries()) {
          expect(result.filename,).toMatch(new RegExp(`^sdserver-[0-9a-f]{8}-${i}\\.png$`,),);
          expect(result.url,).toBe(`/api/assets/${result.id}/raw`,);
          expect(result.mimeType,).toBe("image/png",);
        }
      },
    );
    expect(calls,).toHaveLength(2,);
    expect(calls[0]!.url,).toBe("http://sdserver.test/sdcpp/v1/txt2img",);
    expect(calls[1]!.url,).toBe("http://sdserver.test/sdcpp/v1/jobs/job-42",);
    expect(bodyOf(calls[0]!,).prompt,).toBe("a cat",);
    expect(progress[0],).toEqual({ status: "running", progress: 0.1, message: "Processing...", },);
  });

  test("throws when job submission fails", async () => {
    await withMockFetch(
      () => Response.json({ error: "boom", }, { status: 500, statusText: "Internal Server Error", },),
      async () => {
        await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
          "sd.cpp job submission failed: HTTP 500: Internal Server Error",
        );
      },
    );
  });

  test("throws when the submission response carries no job id", async () => {
    await withMockFetch(
      () => Response.json({ id: "", },),
      async () => {
        await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
          "sd.cpp returned no job id",
        );
      },
    );
  });

  test("throws when the submission response omits the id field entirely", async () => {
    await withMockFetch(
      () => Response.json({ unexpected: true, },),
      async () => {
        await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
          "sd.cpp returned no job id",
        );
      },
    );
  });

  test("throws when polling fails", async () => {
    await withMockFetch(
      (_url, init,) =>
        init?.method === "POST"
          ? Response.json({ id: "job-1", },)
          : Response.json({ error: "poll boom", }, { status: 503, statusText: "Service Unavailable", },),
      async () => {
        await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
          "sd.cpp polling failed: HTTP 503: Service Unavailable",
        );
      },
    );
  });

  test("throws when the job completes without images", async () => {
    await withMockFetch(
      (_url, init,) =>
        init?.method === "POST"
          ? Response.json({ id: "job-1", },)
          : Response.json({ status: "done", images: [], },),
      async () => {
        await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
          "sd.cpp completed but no images",
        );
      },
    );
  });

  test("throws with the server detail when the job fails", async () => {
    await withMockFetch(
      (_url, init,) =>
        init?.method === "POST"
          ? Response.json({ id: "job-1", },)
          : Response.json({ status: "failed", error: "OOM at step 12", },),
      async () => {
        await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
          "sd.cpp job failed: OOM at step 12",
        );
      },
    );
  });

  test("throws with 'no detail' when the job is cancelled without an error", async () => {
    await withMockFetch(
      (_url, init,) =>
        init?.method === "POST"
          ? Response.json({ id: "job-1", },)
          : Response.json({ status: "cancelled", },),
      async () => {
        await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
          "sd.cpp job cancelled: no detail",
        );
      },
    );
  });

  test("forwards poll progress to onProgress across multiple polls", async () => {
    const progress: ImageEditProgress[] = [];
    let poll = 0;
    await withMockFetch(
      (_url, init,) => {
        if (init?.method === "POST") { return Response.json({ id: "job-9", },); }
        poll += 1;
        return poll === 1
          ? Response.json({ status: "running", progress: 0.42, },)
          : Response.json({ status: "done", images: ["b64x",], },);
      },
      async () => {
        const results = await sdcppGenerate(makeHost(), "txt2img", {}, (p,) => {
          progress.push(p,);
        },);
        expect(results,).toHaveLength(1,);
      },
    );
    expect(progress,).toEqual([
      { status: "running", progress: 0.1, message: "Processing...", },
      { status: "running", progress: 0.42, },
    ],);
  });

  test("throws a timeout error when the deadline passes before completion", async () => {
    // First Date.now() call sets the deadline; the second (while-check) jumps past it.
    const originalDateNow = Date.now;
    let nowCalls = 0;
    Date.now = () => (++nowCalls === 1 ? 1_000_000 : 1_400_000);
    try {
      await withMockFetch(
        (_url, init,) =>
          init?.method === "POST"
            ? Response.json({ id: "job-1", },)
            : Response.json({ status: "running", progress: 0.1, },),
        async () => {
          await expect(sdcppGenerate(makeHost(), "txt2img", {},),).rejects.toThrow(
            "sd.cpp job timed out",
          );
        },
      );
    } finally {
      Date.now = originalDateNow;
    }
  });
});

describe("sdapiGenerate", () => {
  test("posts to the sdapi endpoint and maps returned images", async () => {
    const calls = await withMockFetch(
      () => Response.json({ images: ["b64a", "b64b", "b64c",], },),
      async () => {
        const results = await sdapiGenerate(makeHost(ImageApiFamily.Sdapi,), "txt2img", { prompt: "x", },);
        expect(results,).toHaveLength(3,);
        for (const [i, result,] of results.entries()) {
          expect(result.filename,).toMatch(new RegExp(`^sdapi-[0-9a-f]{8}-${i}\\.png$`,),);
          expect(result.url,).toBe(`/api/assets/${result.id}/raw`,);
          expect(result.mimeType,).toBe("image/png",);
        }
      },
    );
    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("http://sdserver.test/sdapi/v1/txt2img",);
    expect(bodyOf(calls[0]!,).prompt,).toBe("x",);
  });

  test("throws when the sdapi call fails", async () => {
    await withMockFetch(
      () => Response.json({ error: "sdapi down", }, { status: 500, statusText: "Internal Server Error", },),
      async () => {
        await expect(sdapiGenerate(makeHost(ImageApiFamily.Sdapi,), "txt2img", {},),).rejects.toThrow(
          "sdapi txt2img failed: HTTP 500: Internal Server Error",
        );
      },
    );
  });
});

describe("openaiGenerate", () => {
  test("sends a Bearer token when the host config carries an apiKey", async () => {
    const calls = await withMockFetch(
      () => Response.json({ data: [{ b64_json: "b64a", },], },),
      async () => {
        const results = await openaiGenerate(
          makeHost(ImageApiFamily.Openai, { apiKey: "sk-test-123", } as ImageProviderConfig,),
          { prompt: "a dog", },
        );
        expect(results,).toHaveLength(1,);
        expect(results[0]!.filename,).toMatch(/^openai-[0-9a-f]{8}-0\.png$/,);
        expect(results[0]!.url,).toBe(`/api/assets/${results[0]!.id}/raw`,);
        expect(results[0]!.mimeType,).toBe("image/png",);
      },
    );
    expect(calls,).toHaveLength(1,);
    expect(calls[0]!.url,).toBe("http://sdserver.test/v1/images/generations",);
    const headers = calls[0]!.init?.headers as Headers;
    expect(headers.get("Authorization",),).toBe("Bearer sk-test-123",);
  });

  test("omits Authorization when no apiKey is configured", async () => {
    const calls = await withMockFetch(
      () => Response.json({ data: [{ b64_json: "b64a", },], },),
      async () => {
        await openaiGenerate(makeHost(ImageApiFamily.Openai,), { prompt: "a dog", },);
      },
    );
    const headers = calls[0]!.init?.headers as Headers;
    expect(headers.get("Authorization",),).toBeNull();
  });

  test("throws when the OpenAI call fails", async () => {
    await withMockFetch(
      () => Response.json({ error: "invalid key", }, { status: 401, statusText: "Unauthorized", },),
      async () => {
        await expect(openaiGenerate(makeHost(ImageApiFamily.Openai,), {},),).rejects.toThrow(
          "OpenAI image gen failed: HTTP 401: Unauthorized",
        );
      },
    );
  });
});
