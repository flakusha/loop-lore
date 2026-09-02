// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Known-answer vectors for the DH ratchet KDF (BUG-dh-ratchet-regression-
 * tests-lack-out-of-order-delivery-across-ratchet-boundary, gap #2).
 *
 * The sibling `dh-ratchet.bugs.test.ts` and `dh-ratchet.test.ts` only assert
 * SELF-CONSISTENCY: the sender and receiver both call the same
 * `dhStep`/`chainStep` primitives, so a refactor that changes the derivation
 * in the SAME wrong way on both sides still round-trips and passes.
 *
 * These vectors are computed by an INDEPENDENT implementation (Node's
 * `crypto.hkdfSync`, HKDF-SHA256, zero-salt of KEY_BYTES, the fixed info
 * labels) and pinned as hex. A drift in `chainStep` / `deriveChainKeyFromRoot`
 * (salt, info string, expand length, extract/expand ordering) breaks them
 * even when both protocol endpoints are changed identically.
 *
 * Vectors pinned 2026-09-02 against primitives.ts; regenerate only when the
 * KDF construction is INTENTIONALLY versioned (bump the `*-v1` info labels).
 */
import { describe, expect, test, } from "bun:test";
import { chainStep, deriveChainKeyFromRoot, } from "./dh-ratchet-primitives.ts";

/**
 * @param b
 */
function hex(b: Uint8Array,): string {
  return Buffer.from(b,).toString("hex",);
}

/** 32-byte ascending seed 0x00..0x1f. */
function ascending32(): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(32,);
  for (let i = 0; i < 32; i++) {
    out[i] = i;
  }
  return out;
}

/** 32-byte fill with a cast to the ArrayBuffer-backed view the API wants. */
function fill32(byte: number,): Uint8Array<ArrayBuffer> {
  return new Uint8Array(32,).fill(byte,) as Uint8Array<ArrayBuffer>;
}

describe("dh-ratchet KDF known-answer vectors (independent derivation)", () => {
  test("deriveChainKeyFromRoot(0x00..0x1f) matches the reference HKDF", async () => {
    const chainKey = await deriveChainKeyFromRoot(ascending32(),);
    expect(hex(new Uint8Array(chainKey,),),).toBe(
      "5f00dd91fda7d0d2a9320baaef785ed5749642817dc5681ee61c188e08a22846",
    );
  });

  test("chainStep(0xab*32) matches the reference next/message keys", async () => {
    const step = await chainStep(fill32(0xab,),);
    expect(hex(step.nextChainKey,),).toBe(
      "11461194053d3a1f2beb45433accba753c45a41e0651b56ac17405c3921a57a4",
    );
    expect(hex(step.messageKeyBytes,),).toBe(
      "77c7e994260febed7d04bc84c7a258a570643b35d5b74b3d34967b59d1f0eac8",
    );
  });

  test("three consecutive chainStep advances match the reference chain", async () => {
    const expected: [string, string,][] = [
      [
        "e50056f83452434e3f5acda2a89eb7314c29ede3f70a0cf67955425ead1fff27",
        "04d32ccbe4a8722eb713df094157dd9d19916ef8394dfa655c7b42dc8bee010d",
      ],
      [
        "38202f804328d1a90fea3a5c4f7ede061decf8ea0f9ec8c617e69a9dd8cd5588",
        "5668e3b7bd24256a719e4b4ddca07b3b8763862aa97c4b9b111e5a12ec4c5020",
      ],
      [
        "7de02c8370dbe74a993b46411d1bcd8667d8bcd53d0ce6e8d24e2be1d7eabeb1",
        "61be2c7c31eabd03294c5e8548e1a9ce6dd9bd7138bae3660d61de718fff446f",
      ],
    ];
    let chainKey: Uint8Array = fill32(0x01,);
    for (const [wantNext, wantMsg,] of expected) {
      const step = await chainStep(chainKey as Uint8Array<ArrayBuffer>,);
      expect(hex(step.nextChainKey,),).toBe(wantNext,);
      expect(hex(step.messageKeyBytes,),).toBe(wantMsg,);
      chainKey = step.nextChainKey;
    }
  });

  test("initial chain key derivation is deterministic", async () => {
    const a = await deriveChainKeyFromRoot(ascending32(),);
    const b = await deriveChainKeyFromRoot(ascending32(),);
    expect(hex(new Uint8Array(a,),),).toBe(hex(new Uint8Array(b,),),);
  });
});
