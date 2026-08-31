// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for bugs filed against the shipped Phase B/C/D crypto code.
 *
 * - BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard:
 *   dhRatchetDecrypt must NOT mutate the caller's state object.
 * - BUG-initdhratchetopts-theirinitialpub-declared-but-never-read:
 *   initDhRatchet must not accept theirInitialPub anymore (option A).
 */
import { describe, expect, test, } from "bun:test";
import {
  dhRatchetDecrypt,
  dhRatchetEncrypt,
  type DhRatchetState,
  initDhRatchet,
} from "./dh-ratchet.ts";

/**
 * @param s
 * @param alicePub
 */
function bobKnowsAlice(s: DhRatchetState, alicePub: JsonWebKey,): DhRatchetState {
  return { ...s, theirCurrentPubJwk: alicePub, };
}

describe("BUG-dhratchetdecrypt-mutates-opts-state-aliasing-hazard", () => {
  test("caller's input state is byte-identical after a chain-continuation decrypt", async () => {
    const rootKey = crypto.getRandomValues(new Uint8Array(32,),);
    const aliceInit = await initDhRatchet({ rootKey, },);
    const bobInit = await initDhRatchet({ rootKey, },);
    let bob = bobKnowsAlice(bobInit.state, aliceInit.myInitialPubJwk,);

    // Decrypt once to advance Bob's recvCount to 1 (counter=0 path).
    const enc1 = await dhRatchetEncrypt({ state: aliceInit.state, plaintext: "first", },);
    const dec1 = await dhRatchetDecrypt({
      state: bob,
      payload: enc1.payload,
      skippedKeys: [],
      maxSkip: 10,
    },);
    bob = dec1.state;
    expect(dec1.plaintext,).toBe("first",);

    // Fingerprint Bob's state.
    const snapshotChainKey = new Uint8Array(bob.receivingChainKey,);
    const snapshotRecvCount = bob.recvCount;
    const snapshotTheirPub = bob.theirCurrentPubJwk;

    // Second decrypt — CONTINUATION branch (counter=1, no DH step).
    const enc2 = await dhRatchetEncrypt({ state: enc1.state, plaintext: "second", },);
    await dhRatchetDecrypt({
      state: bob,
      payload: enc2.payload,
      skippedKeys: [],
      maxSkip: 10,
    },);

    // Caller's `bob` must NOT have been mutated.
    expect(Buffer.from(bob.receivingChainKey,).toString("hex",),)
      .toBe(Buffer.from(snapshotChainKey,).toString("hex",),);
    expect(bob.recvCount,).toBe(snapshotRecvCount,);
    expect(bob.theirCurrentPubJwk,).toBe(snapshotTheirPub,);
  });
});

describe("BUG-initdhratchetopts-theirinitialpub-declared-but-never-read", () => {
  test("initDhRatchet accepts only { rootKey }; deterministic across same root", async () => {
    const rootKey = crypto.getRandomValues(new Uint8Array(32,),);
    const a = await initDhRatchet({ rootKey, },);
    const b = await initDhRatchet({ rootKey, },);
    expect(Buffer.from(a.state.sendingChainKey,).toString("hex",),)
      .toBe(Buffer.from(b.state.sendingChainKey,).toString("hex",),);
    expect(a.myInitialPubJwk,).toBeDefined();
  });
});
