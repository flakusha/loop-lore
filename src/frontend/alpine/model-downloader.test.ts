// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * model-downloader: resume, progress, caps, and integrity enforcement.
 */

import { describe, expect, test, } from "bun:test";
import {
  DownloadFailedError,
  DownloadIntegrityError,
  downloadModel,
  parseContentRangeTotal,
  sha256Hex,
} from "./model-downloader";

const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const HELLO_WORLD_SHA256 = "64ec88ca00b268e5ba1a35678a1b5316d212f4f366b2477232534a8aeca37f3c";

const encode = (text: string,): Uint8Array => new TextEncoder().encode(text,);

interface SeenRequest {
  url: string;
  headers: Record<string, string>;
}

/** Canned fetch: records the request, serves a chunked body. */
function cannedFetch(
  seen: SeenRequest[],
  status: number,
  body: string,
  headers: Record<string, string> = {},
): typeof fetch {
  return (async (url: unknown, init?: RequestInit,): Promise<Response> => {
    seen.push({ url: String(url,), headers: { ...(init?.headers as Record<string, string> ?? {}), }, },);
    const bytes = encode(body,);
    const stream = new ReadableStream<Uint8Array>({
      start(controller,) {
        // Two chunks to exercise the read loop.
        controller.enqueue(bytes.slice(0, 1,),);
        controller.enqueue(bytes.slice(1,),);
        controller.close();
      },
    },);
    return new Response(stream, { status, headers, },);
  }) as typeof fetch;
}

describe("sha256Hex", () => {
  test("matches the known empty/abc vectors", async () => {
    expect(await sha256Hex(encode("abc",),),).toBe(ABC_SHA256,);
    expect(await sha256Hex(new Uint8Array(0,),),).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("parseContentRangeTotal", () => {
  test("extracts totals and rejects garbage", () => {
    expect(parseContentRangeTotal("bytes 6-10/11",),).toBe(11,);
    expect(parseContentRangeTotal(null,),).toBeUndefined();
    expect(parseContentRangeTotal("none",),).toBeUndefined();
  });
});

describe("downloadModel", () => {
  test("full download verifies size and hash with progress", async () => {
    const seen: SeenRequest[] = [];
    const progress: number[] = [];
    const bytes = await downloadModel({
      url: "https://cdn.example.com/tiny.gguf",
      expectedSha256: ABC_SHA256,
      sizeBytes: 3,
      fetchImpl: cannedFetch(seen, 200, "abc", { "Content-Length": "3", },),
      onProgress: (snapshot,) => progress.push(snapshot.loadedBytes,),
    },);
    expect(new TextDecoder().decode(bytes,),).toBe("abc",);
    expect(seen[0]?.headers,).toEqual({},);
    expect(progress.at(-1,),).toBe(3,);
  });

  test("hash mismatch rejects the blob", async () => {
    const seen: SeenRequest[] = [];
    const promise = downloadModel({
      url: "https://cdn.example.com/tiny.gguf",
      expectedSha256: ABC_SHA256,
      fetchImpl: cannedFetch(seen, 200, "xyz",),
    },);
    await expect(promise,).rejects.toBeInstanceOf(DownloadIntegrityError,);
  });

  test("size mismatch rejects the blob", async () => {
    const seen: SeenRequest[] = [];
    const promise = downloadModel({
      url: "https://cdn.example.com/tiny.gguf",
      sizeBytes: 99,
      fetchImpl: cannedFetch(seen, 200, "abc",),
    },);
    await expect(promise,).rejects.toBeInstanceOf(DownloadIntegrityError,);
  });

  test("HTTP failure surfaces status", async () => {
    const seen: SeenRequest[] = [];
    const promise = downloadModel({
      url: "https://cdn.example.com/missing.gguf",
      fetchImpl: cannedFetch(seen, 404, "nope",),
    },);
    const error = await promise.catch((cause,) => cause);
    expect(error,).toBeInstanceOf(DownloadFailedError,);
    expect((error as DownloadFailedError).status,).toBe(404,);
  });

  test("resume sends Range and appends the 206 body", async () => {
    const seen: SeenRequest[] = [];
    const totals: (number | undefined)[] = [];
    const bytes = await downloadModel({
      url: "https://cdn.example.com/model.gguf",
      expectedSha256: HELLO_WORLD_SHA256,
      sizeBytes: 11,
      resumeFrom: encode("Hello ",),
      fetchImpl: cannedFetch(seen, 206, "world", { "Content-Range": "bytes 6-10/11", },),
      onProgress: (snapshot,) => totals.push(snapshot.totalBytes,),
    },);
    expect(seen[0]?.headers.Range,).toBe("bytes=6-",);
    expect(new TextDecoder().decode(bytes,),).toBe("Hello world",);
    expect(totals.at(-1,),).toBe(11,);
  });

  test("200 after Range restarts from scratch", async () => {
    const seen: SeenRequest[] = [];
    const bytes = await downloadModel({
      url: "https://cdn.example.com/tiny.gguf",
      resumeFrom: encode("stale-prefix",),
      fetchImpl: cannedFetch(seen, 200, "abc",),
    },);
    expect(new TextDecoder().decode(bytes,),).toBe("abc",);
  });

  test("416 keeps the complete prefix", async () => {
    const seen: SeenRequest[] = [];
    const bytes = await downloadModel({
      url: "https://cdn.example.com/tiny.gguf",
      expectedSha256: ABC_SHA256,
      resumeFrom: encode("abc",),
      fetchImpl: cannedFetch(seen, 416, "",),
    },);
    expect(new TextDecoder().decode(bytes,),).toBe("abc",);
  });

  test("over-cap stream aborts with integrity error", async () => {
    const seen: SeenRequest[] = [];
    const promise = downloadModel({
      url: "https://cdn.example.com/huge.gguf",
      maxBytes: 2,
      fetchImpl: cannedFetch(seen, 200, "abc",),
    },);
    await expect(promise,).rejects.toBeInstanceOf(DownloadIntegrityError,);
  });

  test("null-body responses fall back to arrayBuffer", async () => {
    const bytes = await downloadModel({
      url: "https://cdn.example.com/tiny.gguf",
      expectedSha256: ABC_SHA256,
      fetchImpl: (async () => ({
        status: 200,
        headers: new Headers(),
        body: null,
        arrayBuffer: async () => encode("abc",).buffer as ArrayBuffer,
      })) as unknown as typeof fetch,
    },);
    expect(new TextDecoder().decode(bytes,),).toBe("abc",);
  });
});
