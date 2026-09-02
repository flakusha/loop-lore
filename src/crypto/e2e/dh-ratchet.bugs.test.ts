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
import { dhStep, } from "./dh-ratchet-primitives.ts";
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
describe("BUG-dhratchetdecrypt-dh-step-branch-derives-message-key-from-stale-chain", () => {
  test("decrypt succeeds when sender rotates ephemeral (DH-step branch)", async () => {
    const rootKey = crypto.getRandomValues(new Uint8Array(32,),);
    const aliceInit = await initDhRatchet({ rootKey, },);
    const bobInit = await initDhRatchet({ rootKey, },);
    let bob = bobKnowsAlice(bobInit.state, aliceInit.myInitialPubJwk,);
    let alice = aliceInit.state;

    // Establish the first DH step from Alice to Bob.
    const enc1 = await dhRatchetEncrypt({ state: alice, plaintext: "first", },);
    alice = enc1.state;
    const dec1 = await dhRatchetDecrypt({
      state: bob,
      payload: enc1.payload,
      skippedKeys: [],
      maxSkip: 10,
    },);
    bob = dec1.state;
    expect(dec1.plaintext,).toBe("first",);
    expect(bob.theirCurrentPubJwk,).not.toBeNull();

    // Alice rotates ephemeral: generate a new keypair, derive a new
    // sending chain key via DH against Bob's current pub, swap state.
    const aliceNewEphemeral = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256", },
      true,
      ["deriveBits",],
    );
    const aliceNewPubJwk = await crypto.subtle.exportKey("jwk", aliceNewEphemeral.publicKey,);
    const bobCurrentPub = await crypto.subtle.importKey(
      "jwk",
      bobInit.myInitialPubJwk,
      { name: "ECDH", namedCurve: "P-256", },
      false,
      [],
    );
    const dh = await dhStep(alice.rootKey, aliceNewEphemeral.privateKey, bobCurrentPub,);
    alice = {
      ...alice,
      rootKey: dh.newRoot,
      sendingChainKey: dh.sendingChainKey,
      myEphemeralPriv: aliceNewEphemeral.privateKey,
      myEphemeralPubJwk: aliceNewPubJwk,
      sendCount: 0,
    };

    // Encrypt through the normal path with the new ephemeral.
    const enc2 = await dhRatchetEncrypt({ state: alice, plaintext: "after-rotate", },);
    // Snapshot Bob's input state so we can prove dhRatchetDecrypt does not
    // mutate the caller in the DH-step branch (the existing aliasing test
    // only covers the CONTINUATION branch).
    const snapshotRootKey = new Uint8Array(bob.rootKey,);
    const snapshotRecvChain = new Uint8Array(bob.receivingChainKey,);
    const snapshotTheirPub = bob.theirCurrentPubJwk;
    const snapshotRecvCount = bob.recvCount;

    // Bob decrypts — must re-enter DH-step branch (payload.ephemeralPublicJwk
    // differs from bob.theirCurrentPubJwk). Before the fix this threw
    // "The operation failed for an operation-specific reason" (AES-GCM auth)
    // because the message key was derived from the stale previous-epoch
    // receivingChainKey instead of the fresh dh.sendingChainKey.
    const dec2 = await dhRatchetDecrypt({
      state: bob,
      payload: enc2.payload,
      skippedKeys: [],
      maxSkip: 10,
    },);
    expect(dec2.plaintext,).toBe("after-rotate",);

    // Returned state must reflect the new epoch:
    //  - theirCurrentPubJwk points to the new ephemeral from the payload
    //  - recvCount advances to 1 (counter was 0 in payload)
    //  - receivingChainKey has advanced (not equal to the snapshot)
    expect(dec2.state.theirCurrentPubJwk,).toEqual(enc2.payload.ephemeralPublicJwk,);
    expect(dec2.state.recvCount,).toBe(1,);
    expect(Buffer.from(dec2.state.receivingChainKey,).toString("hex",),)
      .not.toBe(Buffer.from(snapshotRecvChain,).toString("hex",),);

    // Caller's bob state must be byte-identical to the snapshot.
    expect(Buffer.from(bob.rootKey,).toString("hex",),)
      .toBe(Buffer.from(snapshotRootKey,).toString("hex",),);
    expect(Buffer.from(bob.receivingChainKey,).toString("hex",),)
      .toBe(Buffer.from(snapshotRecvChain,).toString("hex",),);
    expect(bob.theirCurrentPubJwk,).toBe(snapshotTheirPub,);
    expect(bob.recvCount,).toBe(snapshotRecvCount,);
  });
});

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

describe("BUG-dh-ratchet-regression-tests-lack-out-of-order-delivery-across-ratchet-boundary", () => {
  test("out-of-order old-epoch messages populate and drain the skip store; the next-epoch message still decrypts", async () => {
    const rootKey = crypto.getRandomValues(new Uint8Array(32,),);
    const aliceInit = await initDhRatchet({ rootKey, },);
    const bobInit = await initDhRatchet({ rootKey, },);
    let bob = bobKnowsAlice(bobInit.state, aliceInit.myInitialPubJwk,);

    // Alice emits three messages on the initial sending chain (counters 0,1,2).
    const e0 = await dhRatchetEncrypt({ state: aliceInit.state, plaintext: "m0", },);
    const e1 = await dhRatchetEncrypt({ state: e0.state, plaintext: "m1", },);
    const e2 = await dhRatchetEncrypt({ state: e1.state, plaintext: "m2", },);

    // m2 arrives FIRST: the chain-advance must retain keys for counters 0 and 1.
    const d2 = await dhRatchetDecrypt({
      state: bob,
      payload: e2.payload,
      skippedKeys: [],
      maxSkip: 10,
    },);
    expect(d2.plaintext,).toBe("m2",);
    expect(d2.newSkippedKeys.map((k,) => k.counter).sort((a, b,) => a - b),).toEqual([0, 1,],);
    let pool = [...d2.newSkippedKeys,];

    // m0 arrives late — must be served from the skip store, not the live chain.
    const d0 = await dhRatchetDecrypt({
      state: d2.state,
      payload: e0.payload,
      skippedKeys: pool,
      maxSkip: 10,
    },);
    expect(d0.plaintext,).toBe("m0",);
    expect(d0.consumedSkippedKeyIds.length,).toBe(1,);
    pool = pool.filter((k,) => !d0.consumedSkippedKeyIds.includes(k.id,));

    // m1 drains the last retained key.
    const d1 = await dhRatchetDecrypt({
      state: d0.state,
      payload: e1.payload,
      skippedKeys: pool,
      maxSkip: 10,
    },);
    expect(d1.plaintext,).toBe("m1",);
    pool = pool.filter((k,) => !d1.consumedSkippedKeyIds.includes(k.id,));
    expect(pool.length,).toBe(0,);
    bob = d1.state;

    // Ratchet boundary: Alice rotates her ephemeral (DH step) and sends m3.
    // A re-seed bug that derives the receiving chain from stale epoch-1
    // material passes simple in-epoch round-trips but fails here, because
    // the stale chain is now THREE steps advanced.
    const newEphemeral = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256", },
      true,
      ["deriveBits",],
    );
    const newPubJwk = await crypto.subtle.exportKey("jwk", newEphemeral.publicKey,);
    const bobPub = await crypto.subtle.importKey(
      "jwk",
      bobInit.myInitialPubJwk,
      { name: "ECDH", namedCurve: "P-256", },
      false,
      [],
    );
    const dh = await dhStep(e2.state.rootKey, newEphemeral.privateKey, bobPub,);
    const aliceRotated = {
      ...e2.state,
      rootKey: dh.newRoot,
      sendingChainKey: dh.sendingChainKey,
      myEphemeralPriv: newEphemeral.privateKey,
      myEphemeralPubJwk: newPubJwk,
      sendCount: 0,
    };
    const e3 = await dhRatchetEncrypt({ state: aliceRotated, plaintext: "m3", },);

    const d3 = await dhRatchetDecrypt({
      state: bob,
      payload: e3.payload,
      skippedKeys: [],
      maxSkip: 10,
    },);
    expect(d3.plaintext,).toBe("m3",);
    // The new epoch consumed nothing from the drained store, and Bob's
    // receiving key now tracks the fresh epoch chain.
    expect(d3.newSkippedKeys.length,).toBe(0,);
    expect(d3.consumedSkippedKeyIds.length,).toBe(0,);
    expect(d3.state.recvCount,).toBe(1,);
    expect(d3.state.theirCurrentPubJwk,).toEqual(e3.payload.ephemeralPublicJwk,);
  });
});
