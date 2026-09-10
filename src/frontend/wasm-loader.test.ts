// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * wasm-loader tests — exercise the C ABI wrapper through scripted exports
 * (no wasm binary in unit-test envs) plus the fetch-failure paths of
 * `getWasmModule`.
 * @module wasm-loader.test
 */

import { describe, expect, mock, test, } from "bun:test";
import type { WasmNativeModule, } from "./wasm-loader";
// Static import: bun hoists mock.module above imports, so the fe-fetch stub
// registers before ./wasm-loader evaluates (see asset-preview.test.ts).
import { __buildWasmWrapperForTest, getWasmModule, isWasmAvailable, } from "./wasm-loader";

mock.module("./fe-fetch", () => ({
  feFetch: async () => new Response("{}", { status: 404, },),
  getCsrfToken: () => "",
}),);
/** Scripted C ABI exports backed by a real WebAssembly.Memory. */
function fakeModule(overrides: Record<string, unknown> = {},): {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  view: Uint8Array;
} {
  const memory = new WebAssembly.Memory({ initial: 1, },);
  const view = new Uint8Array(memory.buffer,);
  const probeStatus = 0;
  const exports = {
    memory,
    ll_version: () => 1024,
    ll_blake3: (_data: number, _len: number, out: number, outLen: number,): number => {
      view.fill(0xab, out, out + outLen,);
      return 0;
    },
    ll_zstd_compress: (
      _data: number,
      len: number,
      dst: number,
      _dstMax: number,
      _level: number,
    ): number => {
      view.set(view.subarray(0, len,), dst,);
      return len;
    },
    ll_zstd_decompress: (
      _data: number,
      len: number,
      dst: number,
      _capacity: number,
    ): number => {
      view.set(view.subarray(0, len,), dst,);
      return len;
    },
    ll_zstd_decompress_bound: () => 16,
    ll_gguf_probe: (_data: number, _len: number, out: number, _outLen: number,): number => {
      const summary = new DataView(memory.buffer, out, 32,);
      summary.setUint32(0, 3, true,);
      summary.setUint32(8, 7, true,);
      summary.setUint32(12, 0, true,);
      summary.setUint32(16, 2, true,);
      summary.setUint32(20, 0, true,);
      return probeStatus;
    },
    ...overrides,
  };
  return {
    instance: { exports, } as unknown as WebAssembly.Instance,
    memory,
    view,
  };
}

/**
 * Build the wrapper with default scripted exports.
 * @param overrides Export overrides for failure paths.
 */
function build(overrides: Record<string, unknown> = {},): WasmNativeModule {
  const { instance, memory, } = fakeModule(overrides,);
  return __buildWasmWrapperForTest(instance, memory,);
}

describe("wasm-loader — module load", () => {
  test("null when the wasm asset is missing", async () => {
    await expect(getWasmModule(),).resolves.toBeNull();
  });

  test("unavailable when the module failed to load", async () => {
    await expect(isWasmAvailable(),).resolves.toBe(false,);
  });
});

describe("wasm-loader — blake3 wrapper", () => {
  test("returns the 32 digest bytes verbatim", () => {
    const mod = build();
    expect(mod.version,).toBe(1024,);
    expect(mod.blake3.hash(new Uint8Array([1, 2, 3,],),),).toEqual(new Uint8Array(32,).fill(0xab,),);
  });

  test("null when the input exceeds the scratch buffer", () => {
    const mod = build();
    expect(mod.blake3.hash(new Uint8Array(65_536,),),).toBeNull();
  });

  test("null on nonzero status", () => {
    const mod = build({ ll_blake3: () => -1, },);
    expect(mod.blake3.hash(new Uint8Array([1,],),),).toBeNull();
  });
});

describe("wasm-loader — zstd wrapper", () => {
  test("compress echoes the input through the scratch area", () => {
    const mod = build();
    expect(mod.zstd.compress(new Uint8Array([9, 8, 7,],), 3,),).toEqual(new Uint8Array([9, 8, 7,],),);
  });

  test("compress null on oversize input and error status", () => {
    const mod = build();
    expect(mod.zstd.compress(new Uint8Array(40_000,), 1,),).toBeNull();
    const failing = build({ ll_zstd_compress: () => -1, },);
    expect(failing.zstd.compress(new Uint8Array([1,],), 1,),).toBeNull();
  });

  test("decompress and bound round-trip", () => {
    const mod = build();
    expect(mod.zstd.decompressBound(new Uint8Array([5, 6,],),),).toBe(16,);
    expect(mod.zstd.decompress(new Uint8Array([5, 6,],), 16,),).toEqual(new Uint8Array([5, 6,],),);
  });

  test("decompress null on oversize input, bad bound, and error status", () => {
    const mod = build();
    expect(mod.zstd.decompress(new Uint8Array(40_000,), 16,),).toBeNull();
    expect(mod.zstd.decompressBound(new Uint8Array(40_000,),),).toBeNull();
    const badBound = build({ ll_zstd_decompress_bound: () => -1, },);
    expect(badBound.zstd.decompress(new Uint8Array([1,],), 16,),).toBeNull();
    expect(badBound.zstd.decompressBound(new Uint8Array([1,],),),).toBeNull();
    const failing = build({ ll_zstd_decompress: () => -1, },);
    expect(failing.zstd.decompress(new Uint8Array([1,],), 16,),).toBeNull();
  });
});

describe("wasm-loader — gguf wrapper", () => {
  test("decodes the 32-byte probe summary", () => {
    const mod = build();
    expect(mod.gguf.probe(new Uint8Array([0x47, 0x47, 0x55, 0x46,],),),).toEqual({
      version: 3,
      tensorCount: 7,
      kvCount: 2,
    },);
  });

  test("null when the export is missing (predates the probe)", () => {
    const { instance, memory, } = fakeModule({ ll_gguf_probe: undefined, },);
    const mod = __buildWasmWrapperForTest(instance, memory,);
    expect(mod.gguf.probe(new Uint8Array([0x47,],),),).toBeNull();
  });

  test("null on empty and oversize headers", () => {
    const mod = build();
    expect(mod.gguf.probe(new Uint8Array(0,),),).toBeNull();
    expect(mod.gguf.probe(new Uint8Array(65_536,),),).toBeNull();
  });

  test("null on nonzero probe status", () => {
    const { instance, memory, } = fakeModule();
    const failingExports = {
      ...(instance.exports as unknown as Record<string, unknown>),
      ll_gguf_probe: () => -2,
    };
    const failing = __buildWasmWrapperForTest(
      { exports: failingExports, } as unknown as WebAssembly.Instance,
      memory,
    );
    expect(failing.gguf.probe(new Uint8Array([0x47,],),),).toBeNull();
  });
});
