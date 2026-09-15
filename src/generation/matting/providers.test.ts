// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { createHttpMattingProvider, } from "./providers";

// Mirror the repo-wide test convention.
createLogger({ level: "error", },);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4,],);

function okResponse(bytes: Uint8Array,): Response {
  return new Response(bytes as BodyInit, { status: 200, },);
}

function stubFetch(responder: () => Promise<Response>,): void {
  globalThis.fetch = responder as unknown as typeof fetch;
}

describe("createHttpMattingProvider", () => {
  test("returns PNG bytes from a 200 response", async () => {
    stubFetch(async () => okResponse(PNG,));
    const p = createHttpMattingProvider({ name: "t", endpoint: "http://127.0.0.1:9/matte", },);
    const out = await p.removeBackground(Buffer.from([1, 2, 3,],),);
    expect(out.subarray(0, 4,),).toEqual(Buffer.from([137, 80, 78, 71,],),);
  });

  test("rejects non-PNG payloads", async () => {
    stubFetch(async () => okResponse(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8,],),));
    const p = createHttpMattingProvider({ name: "t", endpoint: "http://127.0.0.1:9/matte", },);
    await expect(p.removeBackground(Buffer.from([1,],),),).rejects.toThrow("non-PNG",);
  });

  test("surfaces HTTP errors without reading the body as PNG", async () => {
    stubFetch(async () => new Response("nope", { status: 500, },));
    const p = createHttpMattingProvider({ name: "t", endpoint: "http://127.0.0.1:9/matte", },);
    await expect(p.removeBackground(Buffer.from([1,],),),).rejects.toThrow("HTTP 500",);
  });
});
