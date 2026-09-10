// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Loader dlopen-path gaps — success, ABI drift, dlopen failure.
 *
 * The cdylib is absent in unit-test envs, so only the missing-binary branch
 * runs without fakes (`loader.test.ts` covers the unsupported-platform
 * branch). `bun:ffi` (dlopen) + `node:fs` (existsSync) are stubbed to walk
 * the dlopen paths; `__resetNativeModuleCache` re-arms the loader between
 * scenarios. Isolated-gate only (see blake3-gaps.test.ts): the `bun:ffi`
 * stub must not leak into shared-process runs.
 */

import { describe, expect, mock, test, } from "bun:test";

/** True only when each test file owns its module registry (`--isolate`). */
const ISOLATED_RUN = ["test", "test:unit", "test:coverage", "check:parallel",].includes(
  process.env.npm_lifecycle_event ?? "",
);
const describeOrSkipIsolated = ISOLATED_RUN ? describe : describe.skip;

const stub = { mode: "ok" as "ok" | "mismatch" | "throw", dlopenCalls: 0, };

if (ISOLATED_RUN) {
  mock.module("bun:ffi", () => ({
    dlopen: (_path: string, _symbols: unknown,) => {
      stub.dlopenCalls += 1;
      if (stub.mode === "throw") { throw new Error("dlopen boom",); }
      return {
        symbols: {
          ll_version: () => (stub.mode === "mismatch" ? 999 : (0 << 16) | (4 << 8)),
          ll_blake3: () => 0,
          ll_zstd_compress: () => 0,
          ll_zstd_decompress: () => 0,
          ll_zstd_decompress_bound: () => 0,
        },
      };
    },
    FFIType: { i32: 0, ptr: 1, u64: 2, i64: 3, },
  }),);
  mock.module("node:fs", () => ({
    existsSync: (_path: string,) => true,
  }),);
}

// Dynamic import: mocks must register before ./loader evaluates (module
// loading boundary — static imports hoist above the mock calls).
const {
  __resetNativeModuleCache,
  getNativeModule,
  getNativeStatus,
  isNativeAvailable,
  resolveNativeBinaryPath,
} = await import("./loader");

describeOrSkipIsolated("loader gaps — dlopen success path", () => {
  test("loads and verifies the ABI when the binary is present", () => {
    stub.mode = "ok";
    stub.dlopenCalls = 0;
    __resetNativeModuleCache();
    const module = getNativeModule();
    expect(module,).not.toBeNull();
    expect(module?.version,).toBe((0 << 16) | (4 << 8),);
    expect(stub.dlopenCalls,).toBe(1,);
  });

  test("caches the module instead of reopening it", () => {
    stub.mode = "ok";
    stub.dlopenCalls = 0;
    __resetNativeModuleCache();
    const first = getNativeModule();
    const second = getNativeModule();
    expect(second,).toBe(first,);
    expect(stub.dlopenCalls,).toBe(1,);
  });

  test("status reports the rust implementation with a binary path", () => {
    stub.mode = "ok";
    __resetNativeModuleCache();
    expect(isNativeAvailable(),).toBe(true,);
    const status = getNativeStatus();
    expect(status,).toMatchObject({ available: true, implementation: "rust", version: (0 << 16) | (4 << 8), },);
    expect(status.binaryPath,).toContain("loop-lore-native",);
    expect(status.platform,).toBe(process.platform,);
  });

  test("resolves the release candidate when it exists", () => {
    expect(resolveNativeBinaryPath(),).toContain("release",);
  });
},);

describeOrSkipIsolated("loader gaps — failure paths", () => {
  test("refuses the binary on ABI drift", () => {
    stub.mode = "mismatch";
    __resetNativeModuleCache();
    try {
      expect(getNativeModule(),).toBeNull();
      expect(isNativeAvailable(),).toBe(false,);
    } finally {
      stub.mode = "ok";
    }
  });

  test("degrades to null when dlopen throws", () => {
    stub.mode = "throw";
    __resetNativeModuleCache();
    try {
      expect(getNativeModule(),).toBeNull();
    } finally {
      stub.mode = "ok";
    }
  });
},);
