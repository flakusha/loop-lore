/**
 * BLAKE3 native-module tests — vectors, native/fallback parity, status.
 *
 * The native path is exercised when the cdylib is built (cargo available at
 * build stage); the fallback path always is. Both must agree byte-for-byte.
 */

import { describe, expect, test, } from "bun:test";
import { blake3Hash, getBlake3Status, isNativeBlake3Available, } from "./blake3";
import { blake3Hash as fallbackBlake3, } from "./fallback/blake3";
import { getNativeStatus, } from "./loader";

/**
Official BLAKE3 vectors; 1024×'a' cross-verified with the Rust crate.
*/
const VECTORS: { input: Uint8Array; expected: string }[] = [
  {
    input: new Uint8Array(0,),
    expected: "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262",
  },
  {
    input: new TextEncoder().encode("abc",),
    expected: "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85",
  },
  {
    input: new TextEncoder().encode("hello world",),
    expected: "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
  },
  {
    input: new Uint8Array(1024,).fill(0x61,), // 1024 × 'a'
    expected: "5a1c9e5d85d9898297037e8e24f69bb0e604a84c91c3b3ef4784a374812900d9",
  },
];

function toHex(bytes: Uint8Array,): string {
  return Buffer.from(bytes,).toString("hex",);
}

describe("blake3 vectors", () => {
  for (const { input, expected, } of VECTORS) {
    test(`native+fallback hash of ${input.length} bytes`, () => {
      expect(toHex(blake3Hash(input,),),).toBe(expected,);
      expect(toHex(fallbackBlake3(input,),),).toBe(expected,);
    });
  }
});

describe("native/fallback parity", () => {
  const corpus: Uint8Array[] = [
    new Uint8Array(0,),
    new TextEncoder().encode("deterministic output",),
    new TextEncoder().encode("unicode: héllo — 日本語 🚀",),
    new Uint8Array([0, 1, 2, 255, 128, 64,],), // binary
    new Uint8Array(65_536,).map((_, i,) => (i % 251)), // 64 KiB patterned
  ];

  for (const input of corpus) {
    test(`parity for ${input.length} bytes`, () => {
      const native = blake3Hash(input,);
      const fallback = fallbackBlake3(input,);
      expect(toHex(native,),).toBe(toHex(fallback,),);
    });
  }

  test("deterministic across calls", () => {
    const input = new TextEncoder().encode("deterministic output",);
    expect(toHex(blake3Hash(input,),),).toBe(toHex(blake3Hash(input,),),);
  });

  test("digest length is 32 bytes", () => {
    expect(blake3Hash(new Uint8Array(1,),),).toHaveLength(32,);
  });
});

describe("native status", () => {
  test("status shape is stable and serializable", () => {
    const status = getBlake3Status();
    expect(typeof status.implementation,).toBe("string",);
    expect(["rust", "ts",],).toContain(status.implementation,);
    expect(typeof status.nativeAvailable,).toBe("boolean",);
    expect(status.platform,).toBe(process.platform,);
  });

  test("loader status agrees with wrapper status", () => {
    expect(getNativeStatus().available,).toBe(getBlake3Status().nativeAvailable,);
    expect(getNativeStatus().implementation === "rust",).toBe(
      getBlake3Status().implementation === "rust",
    );
  });

  test("binary path resolves to the crate target dir", () => {
    const { binaryPath, } = getNativeStatus();
    const supported = ["linux", "darwin", "win32",].includes(process.platform,);
    if (supported) {
      expect(binaryPath,).toContain("native/loop-lore-native/target",);
    }
  });

  test("native availability flag matches status", () => {
    expect(isNativeBlake3Available(),).toBe(getNativeStatus().available,);
  });
});
