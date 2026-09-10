// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * skipOldChain tests — the late-delivery capture used when the receiving
 * chain has advanced past `recvCount` (re-ordering, dropped messages,
 * parallel chains). These tests pin the chain-step contract:
 *   - zero gap → empty result
 *   - each step increments the counter and derives a fresh message key
 *   - the receiving chain key is zeroed in place after each step
 *     (no leftover material in the captured buffer).
 *   - theirCurrentPubJwk propagates to every skipped record
 *   - null theirCurrentPubJwk falls back to a placeholder EC JWK
 *     (per-actor seed may not have advertised a public key yet).
 */
import { describe, expect, test, } from "bun:test";
import { skipOldChain, } from "./dh-ratchet-helpers";

const KEY_BYTES = 32;

function key(fill: number,): Uint8Array {
  const k = new Uint8Array(KEY_BYTES,);
  k.fill(fill,);
  return k;
}

describe("skipOldChain", () => {
  test("returns [] when untilCounter is zero (the no-gap fast path)", async () => {
    const state = {
      receivingChainKey: key(0xaa,),
      recvCount: 42,
      theirCurrentPubJwk: { kty: "EC", x: "x", y: "y", } as JsonWebKey,
    };
    const skipped = await skipOldChain(state, 0,);
    expect(skipped,).toEqual([],);
  });

  test("one step records a single SkippedKey at recvCount with chain key zeroed", async () => {
    const state = {
      receivingChainKey: key(0xaa,),
      recvCount: 7,
      theirCurrentPubJwk: { kty: "EC", x: "x", y: "y", } as JsonWebKey,
    };
    const skipped = await skipOldChain(state, 1,);

    expect(skipped.length,).toBe(1,);
    const record = skipped[0]!;
    expect(record.counter,).toBe(7,);
    expect(record.ephemeralPublicJwk,).toEqual({ kty: "EC", x: "x", y: "y", },);
    expect(record.id,).toMatch(/^[0-9a-f-]{36}$/i,);
    expect(record.messageKeyBytes.byteLength,).toBe(KEY_BYTES,);
    // The captured receivingChainKey buffer was zeroed in place — the
    // input array is the one `state` exposes, so the mutation is visible.
    expect(Array.from(state.receivingChainKey,),).toEqual(new Array(KEY_BYTES,).fill(0,),);
  });

  test("multi-step gap captures every intermediate counter and rotates the chain key", async () => {
    const state = {
      receivingChainKey: key(0x10,),
      recvCount: 100,
      theirCurrentPubJwk: null,
    };
    const skipped = await skipOldChain(state, 3,);

    expect(skipped.length,).toBe(3,);
    expect(skipped.map((s,) => s.counter),).toEqual([100, 101, 102,],);

    // Each message key must differ — chainStep derives a fresh key per hop.
    const keys = skipped.map((s,) => Array.from(s.messageKeyBytes,));
    expect(new Set(keys.map((k,) => Buffer.from(k,).toString("hex",)),),).toHaveProperty("size", 3,);

    // With null theirCurrentPubJwk, each record inherits the placeholder.
    for (const record of skipped) {
      expect(record.ephemeralPublicJwk,).toEqual({ kty: "EC", },);
    }
  });

  test("successive calls with different gaps produce stable, gap-relative counters", async () => {
    const base = {
      receivingChainKey: key(0x77,),
      recvCount: 0,
      theirCurrentPubJwk: null,
    };
    const first = await skipOldChain(base, 2,);
    expect(first.map((s,) => s.counter),).toEqual([0, 1,],);

    // Second call uses a fresh state at a higher recvCount — counter
    // anchoring is absolute, not relative to the previous capture.
    const next = await skipOldChain(
      { ...base, receivingChainKey: key(0x88,), },
      1,
    );
    expect(next.map((s,) => s.counter),).toEqual([0,],);
  });
});
