// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { expect, mock, test, } from "bun:test";
import { describeOrSkipStrict, STRICTLY_ISOLATED, } from "../test-utils/isolate-only";

/** Typed view of Bun's built-in zstd (mirrors the unit under test). */
interface BunZstd {
  zstdDecompressSync(data: Uint8Array,): Uint8Array;
}

const bunZstd = Bun as unknown as BunZstd;

const stub = {
  compressFail: 0,
  decompressFail: 0,
  boundFail: 0,
};

/** Identity-copy fake: pretends the cdylib round-trips bytes losslessly. */
const fakeHandle = {
  ll_zstd_compress: (data: Uint8Array, len: number, out: Uint8Array, outLen: number,): number => {
    if (stub.compressFail !== 0) { return stub.compressFail; }
    const n = Math.min(len, outLen, data.length,);
    out.set(data.subarray(0, n,), 0,);
    return n;
  },
  ll_zstd_decompress: (data: Uint8Array, len: number, out: Uint8Array, outLen: number,): number => {
    if (stub.decompressFail !== 0) { return stub.decompressFail; }
    const n = Math.min(len, outLen, data.length,);
    out.set(data.subarray(0, n,), 0,);
    return n;
  },
  ll_zstd_decompress_bound: (data: Uint8Array, _len: number,): number => {
    if (stub.boundFail !== 0) { return stub.boundFail; }
    return data.length;
  },
};

// Loader mock leaks process-globally without --isolate (fake native handle
// would serve later suites, e.g. zstd.test.ts): gate it like other
// mock.module suites so plain `bun test src/` keeps the real loader.
if (STRICTLY_ISOLATED) {
  mock.module("./loader", () => ({
    getNativeModule: () => ({ handle: fakeHandle, version: 3, }),
    isNativeAvailable: () => true,
  }),);
}

// Dynamic import: mock.module must register before ./zstd evaluates, so a
// static import (hoisted above the mock) cannot work here.
const { isNativeZstdAvailable, zstdCompress, zstdDecompress, } = await import("./zstd");

describeOrSkipStrict("zstd gaps — native compress path", () => {
  test("native success returns the sliced output", () => {
    const input = new Uint8Array([9, 8, 7, 6,],);
    expect(zstdCompress(input,),).toEqual(input,);
  });

  test("bad level falls through to Bun and yields a real frame", () => {
    stub.compressFail = -4;
    try {
      const input = new TextEncoder().encode("fallback frame",);
      const frame = zstdCompress(input, 3,);
      expect(frame[0],).toBe(0x28,);
      expect(frame[1],).toBe(0xB5,);
      expect(frame[2],).toBe(0x2F,);
      expect(frame[3],).toBe(0xFD,);
      expect(bunZstd.zstdDecompressSync(frame,),).toEqual(input,);
    } finally {
      stub.compressFail = 0;
    }
  });

  test("Bun validates the level on the fallthrough path", () => {
    stub.compressFail = -4;
    try {
      expect(() => zstdCompress(new Uint8Array([1,],), 99,)).toThrow(
        "Compression level must be between 1 and 22",
      );
    } finally {
      stub.compressFail = 0;
    }
  });

  test("unknown native error code throws with the code", () => {
    stub.compressFail = -999;
    try {
      expect(() => zstdCompress(new Uint8Array([1,],),)).toThrow(
        "zstd compress failed (native code -999)",
      );
    } finally {
      stub.compressFail = 0;
    }
  });
},);

describeOrSkipStrict("zstd gaps — native decompress path", () => {
  test("native success returns the sliced output", () => {
    const input = new Uint8Array([4, 5, 6,],);
    expect(zstdDecompress(input,),).toEqual(input,);
  });

  test("negative bound throws unknown-or-corrupt error", () => {
    stub.boundFail = -1;
    try {
      expect(() => zstdDecompress(new Uint8Array([1, 2,],),)).toThrow(
        "zstd decompress failed: unknown or corrupt frame",
      );
    } finally {
      stub.boundFail = 0;
    }
  });

  test("negative status throws with the code", () => {
    stub.decompressFail = -5;
    try {
      expect(() => zstdDecompress(new Uint8Array([1, 2,],),)).toThrow(
        "zstd decompress failed (native code -5)",
      );
    } finally {
      stub.decompressFail = 0;
    }
  });
},);

describeOrSkipStrict("zstd gaps — availability", () => {
  test("reports native available when the loader resolves", () => {
    expect(isNativeZstdAvailable(),).toBe(true,);
  });
},);
