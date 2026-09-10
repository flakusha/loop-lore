// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * gguf-probe tests — mirror the Rust `gguf` module vectors so both
 * implementations accept/reject the same blobs with the same codes.
 * @module gguf-probe.test
 */

import { describe, expect, test, } from "bun:test";
import { GgufProbeError, probeGguf, probeGgufSync, } from "./gguf-probe";

/** Minimal valid GGUF blob: header + 1 string KV + 1 tensor. */
function minimalBlob(): Uint8Array {
  const parts: number[] = [];
  const u32 = (v: number,): void => {
    parts.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff,);
  };
  const u64 = (v: number,): void => {
    u32(v >>> 0,);
    u32(Math.floor(v / 4294967296,),);
  };
  const raw = (bytes: number[],): void => {
    parts.push(...bytes,);
  };
  const text = (s: string,): void => {
    const encoded = new TextEncoder().encode(s,);
    u64(encoded.length,);
    raw(Array.from(encoded,),);
  };
  raw([0x47, 0x47, 0x55, 0x46,],); // magic
  u32(3,); // version
  u64(1,); // n_tensors
  u64(1,); // n_kv
  text("general.name",);
  u32(8,); // string tag
  text("tiny",);
  text("w",); // tensor name
  u32(2,); // n_dims
  u64(8,);
  u64(8,);
  u32(0,); // ggml type F32
  u64(0,); // offset
  return new Uint8Array(parts,);
}

/**
 * Expect the probe to throw a GgufProbeError with the given code.
 * @param data Header bytes to probe.
 * @param code Expected probe error code.
 */
function expectProbeCode(data: Uint8Array, code: -2 | -3 | -4,): void {
  try {
    probeGgufSync(data,);
  } catch (error) {
    expect(error,).toBeInstanceOf(GgufProbeError,);
    expect((error as GgufProbeError).code,).toBe(code,);
    return;
  }
  throw new Error(`expected probe to throw ${code}`,);
}

describe("gguf-probe — valid headers", () => {
  test("minimal blob reports version, tensor, and kv counts", () => {
    expect(probeGgufSync(minimalBlob(),),).toEqual({ version: 3, tensorCount: 1, kvCount: 1, },);
  });

  test("trailing tensor data is ignored", () => {
    const padded = new Uint8Array([...minimalBlob(), 1, 2, 3, 4,],);
    expect(probeGgufSync(padded,),).toEqual({ version: 3, tensorCount: 1, kvCount: 1, },);
  });

  test("array-of-string metadata is skipped", () => {
    const parts: number[] = [];
    const u32 = (v: number,): void => {
      parts.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff,);
    };
    const u64 = (v: number,): void => {
      u32(v >>> 0,);
      u32(0,);
    };
    const text = (s: string,): void => {
      const encoded = new TextEncoder().encode(s,);
      u64(encoded.length,);
      parts.push(...encoded,);
    };
    parts.push(0x47, 0x47, 0x55, 0x46,);
    u32(3,);
    u64(0,);
    u64(1,);
    text("tags",);
    u32(9,); // array tag
    u32(8,); // element: string
    u64(2,);
    text("a",);
    text("bb",);
    expect(probeGgufSync(new Uint8Array(parts,),),).toEqual({ version: 3, tensorCount: 0, kvCount: 1, },);
  });
});

describe("gguf-probe — invalid headers", () => {
  test("bad magic reports -2", () => {
    const blob = minimalBlob();
    blob[0] = 0x00;
    expectProbeCode(blob, -2,);
  });

  test("empty input reports -3, not -2", () => {
    expectProbeCode(new Uint8Array(0,), -3,);
  });

  test("truncated prefixes report -3", () => {
    const blob = minimalBlob();
    for (const end of [4, 10, 20, 40,]) {
      expectProbeCode(blob.subarray(0, end,), -3,);
    }
  });

  test("unknown metadata type reports -4", () => {
    const blob = minimalBlob();
    // KV type tag sits at 4 + 4 + 8 + 8 + 8 + 12 = 44.
    blob[44] = 99;
    blob[45] = 0;
    blob[46] = 0;
    blob[47] = 0;
    expectProbeCode(blob, -4,);
  });

  test("tensor with 5 dims reports -4", () => {
    const blob = minimalBlob();
    // n_dims offset: header 24 + key(8+12) + tag 4 + value(8+4) + name(8+1) = 69.
    blob[69] = 5;
    expectProbeCode(blob, -4,);
  });
});

describe("gguf-probe — async entry", () => {
  test("falls back to the TS parser when WASM is unavailable", async () => {
    await expect(probeGguf(minimalBlob(),),).resolves.toEqual({
      version: 3,
      tensorCount: 1,
      kvCount: 1,
    },);
  });

  test("rejects invalid data with the same codes", async () => {
    await expect(probeGguf(new Uint8Array([1, 2, 3, 4,],),),).rejects.toMatchObject({ code: -2, },);
  });
});
