// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BLAKE3 native-path gaps — cdylib success + runtime-degrade branches.
 *
 * `blake3.test.ts` covers the fallback path (no cdylib in unit-test envs);
 * the `getNativeModule() !== null` branches need an injected fake handle.
 * Isolated-gate only: `mock.module` must not serve the fake handle to
 * unrelated suites in shared-process runs (`test:unit:parallel`, bare
 * `bun test`). Gated on `npm_lifecycle_event` (the `--isolate` flag itself
 * is invisible inside test processes): the allow-list names exactly the
 * scripts whose `bun test` runs pass `--isolate` — direct (`test`,
 * `test:unit`, `test:coverage`) and pipeline-spawned (`check:parallel`,
 * whose coverage command runs `bun test --isolate` in-process).
 */

import { describe, expect, mock, test, } from "bun:test";
import { blake3Hash as fallbackBlake3, } from "./fallback/blake3";

/** True only when each test file owns its module registry (`--isolate`). */
const ISOLATED_RUN = ["test", "test:unit", "test:coverage", "check:parallel",].includes(
  process.env.npm_lifecycle_event ?? "",
);
const describeOrSkipIsolated = ISOLATED_RUN ? describe : describe.skip;

const stub = { status: 0, };

/** Fake cdylib: fills the caller buffer with a fixed pattern on success. */
const fakeHandle = {
  ll_blake3: (_data: Uint8Array, _len: number, out: Uint8Array, _outLen: number,): number => {
    if (stub.status !== 0) { return stub.status; }
    out.fill(0xab,);
    return 0;
  },
};

if (ISOLATED_RUN) {
  mock.module("./loader", () => ({
    getNativeModule: () => ({ handle: fakeHandle, version: (0 << 16) | (4 << 8), }),
    isNativeAvailable: () => true,
    getNativeStatus: () => ({
      available: true,
      implementation: "rust" as const,
      version: (0 << 16) | (4 << 8),
      binaryPath: "/fake/libloop_lore_native.so",
      platform: process.platform,
    }),
  }),);
}

// Dynamic import: mock.module must register before ./blake3 evaluates, so a
// static import (hoisted above the mock) cannot work here.
const { blake3Hash, getBlake3Status, isNativeBlake3Available, } = await import("./blake3");

describeOrSkipIsolated("blake3 gaps — native success path", () => {
  test("native success returns the cdylib buffer verbatim", () => {
    stub.status = 0;
    const result = blake3Hash(new TextEncoder().encode("abc",),);
    expect(result,).toHaveLength(32,);
    expect(result,).toEqual(new Uint8Array(32,).fill(0xab,),);
  });

  test("native bytes differ from the fallback digest (proves the branch)", () => {
    stub.status = 0;
    const input = new TextEncoder().encode("abc",);
    expect(Buffer.from(blake3Hash(input,),).toString("hex",),).not.toBe(
      Buffer.from(fallbackBlake3(input,),).toString("hex",),
    );
  });
},);

describeOrSkipIsolated("blake3 gaps — runtime degrade path", () => {
  test("nonzero status falls back to the pure-TS digest", () => {
    stub.status = -1;
    try {
      const input = new TextEncoder().encode("abc",);
      expect(blake3Hash(input,),).toEqual(fallbackBlake3(input,),);
    } finally {
      stub.status = 0;
    }
  });
},);

describeOrSkipIsolated("blake3 gaps — status under native", () => {
  test("reports the rust implementation when the loader resolves", () => {
    expect(getBlake3Status().implementation,).toBe("rust",);
    expect(getBlake3Status().nativeAvailable,).toBe(true,);
    expect(isNativeBlake3Available(),).toBe(true,);
  });
},);
