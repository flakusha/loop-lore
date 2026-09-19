// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * rembg HTTP provider tests.
 *
 * Contract (verified against rembg's FastAPI server): multipart POST to
 * `<base>/api/remove` with `file`, `model`, `dc` form fields; PNG bytes back.
 */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { createRembgMattingProvider, } from "./providers";

// Mirror the repo-wide test convention.
createLogger({ level: "error", },);

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3,],);

interface CapturedCall {
  url: string;
  init: RequestInit;
}

/** Replace global fetch; captures the last call and returns canned bytes. Returns a restore fn. */
function stubFetch(response: Response | Promise<Response>,): { calls: CapturedCall[]; restore: () => void } {
  const calls: CapturedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ url: String(input,), init: init ?? {}, },);
    return await response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("createRembgMattingProvider", () => {
  test("posts multipart file/model/dc to /api/remove and returns PNG", async () => {
    const { calls, } = stubFetch(new Response(PNG,),);
    const provider = createRembgMattingProvider({
      baseUrl: "http://127.0.0.1:7000/",
      model: "isnet-general-use",
    },);

    const out = await provider.removeBackground(Buffer.from([1, 2, 3,],),);

    expect(out.subarray(0, 4,),).toEqual(Buffer.from([137, 80, 78, 71,],),);
    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.url,).toBe("http://127.0.0.1:7000/api/remove",);
    const form = calls[0]?.init.body as FormData;
    expect(form.get("model",),).toBe("isnet-general-use",);
    expect(form.get("dc",),).toBe("true",);
    expect(form.get("file",),).toBeInstanceOf(File,);
  });

  test("defaults to isnet-general-use and honors decontaminate=false", async () => {
    const { calls, } = stubFetch(new Response(PNG,),);
    const provider = createRembgMattingProvider({
      baseUrl: "http://127.0.0.1:7000",
      decontaminate: false,
    },);
    await provider.removeBackground(Buffer.from([1,],),);

    const form = calls[0]?.init.body as FormData;
    expect(form.get("model",),).toBe("isnet-general-use",);
    expect(form.get("dc",),).toBe("false",);
    expect(provider.name,).toBe("rembg:isnet-general-use",);
  });

  test("rejects a non-PNG payload", async () => {
    stubFetch(new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8,],),),);
    const provider = createRembgMattingProvider({
      baseUrl: "http://127.0.0.1:7000",
    },);
    await expect(provider.removeBackground(Buffer.from([1,],),),).rejects.toThrow(
      "non-PNG",
    );
  });

  test("surfaces HTTP errors", async () => {
    stubFetch(new Response("nope", { status: 500, },),);
    const provider = createRembgMattingProvider({
      baseUrl: "http://127.0.0.1:7000",
    },);
    await expect(provider.removeBackground(Buffer.from([1,],),),).rejects.toThrow(
      "HTTP 500",
    );
  });
});
