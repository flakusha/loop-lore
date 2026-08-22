/**
 * Unit tests for crypto/e2e/dh-ratchet.ts — symmetric chain ratchet with
 * skipped-key retention (TASK-asymmetric-key-pairs-followup §Phase B).
 *
 * Covers:
 * - Round-trip: encrypt → decrypt on the same chain
 * - Multiple ordered messages: counter advances in lock-step
 * - Skipped-key buffer: late-arriving message uses stored skipped key
 * - maxSkip guard: too many skips throws
 * - Counter regression without skipped key throws
 * - Tamper detection: ciphertext flip throws auth-tag mismatch
 * - Init symmetry: both sides produce same chain key from same root
 */
import { describe, expect, test, } from "bun:test";
import type { DhMessagePayload, } from "./dh-ratchet-primitives.ts";
import {
  dhRatchetDecrypt,
  dhRatchetEncrypt,
  type DhRatchetState,
  initDhRatchet,
} from "./dh-ratchet.ts";
import { generateKeyPair, } from "./key-pairs.ts";

async function setupAliceBob(): Promise<{
  aliceState: DhRatchetState;
  aliceInitialPubJwk: JsonWebKey;
  bobState: DhRatchetState;
}> {
  const aliceIdentity = await generateKeyPair();
  const bobIdentity = await generateKeyPair();
  // rootKey is a 32-byte shared secret derived out-of-band (e.g. via the
  // existing `deriveSharedSecret` in key-pairs.ts). Tests use a fresh
  // random value here for realism.
  const rootKey = crypto.getRandomValues(new Uint8Array(32,),);

  const aliceInit = await initDhRatchet({
    rootKey,
    theirInitialPub: bobIdentity.publicKey,
  },);
  const bobInit = await initDhRatchet({
    rootKey,
    theirInitialPub: aliceIdentity.publicKey,
  },);
  return {
    aliceState: aliceInit.state,
    aliceInitialPubJwk: aliceInit.myInitialPubJwk,
    bobState: bobInit.state,
  };
}

/** Bob must know Alice's ephemeral pub before he can decrypt her messages. */
function bobKnowsAlice(
  bobState: DhRatchetState,
  aliceInitialPubJwk: JsonWebKey,
): DhRatchetState {
  return { ...bobState, theirCurrentPubJwk: aliceInitialPubJwk, };
}

async function aliceSendsN(
  state: DhRatchetState,
  n: number,
): Promise<{ state: DhRatchetState; payloads: DhMessagePayload[] }> {
  let aState = state;
  const payloads: DhMessagePayload[] = [];
  for (let i = 0; i < n; i++) {
    const r = await dhRatchetEncrypt({ state: aState, plaintext: `msg-${i}`, },);
    aState = r.state;
    payloads.push(r.payload,);
  }
  return { state: aState, payloads, };
}

describe("dh-ratchet: symmetric chain ratchet (Phase B)", () => {
  test("round-trip: Alice encrypts, Bob decrypts same plaintext", async () => {
    const { aliceState, aliceInitialPubJwk, bobState, } = await setupAliceBob();

    const enc = await dhRatchetEncrypt({ state: aliceState, plaintext: "hello bob", },);
    const dec = await dhRatchetDecrypt({
      state: bobKnowsAlice(bobState, aliceInitialPubJwk,),
      payload: enc.payload,
      skippedKeys: [],
      maxSkip: 10,
    },);

    expect(dec.plaintext,).toBe("hello bob",);
    expect(dec.state.recvCount,).toBe(1,);
    expect(enc.payload.counter,).toBe(0,);
  });

  test("multiple messages in order: counter advances in lock-step", async () => {
    const { aliceState, aliceInitialPubJwk, bobState, } = await setupAliceBob();
    const { payloads, } = await aliceSendsN(aliceState, 5,);

    let bState = bobKnowsAlice(bobState, aliceInitialPubJwk,);
    for (let i = 0; i < 5; i++) {
      const dec = await dhRatchetDecrypt({
        state: bState,
        payload: payloads[i]!,
        skippedKeys: [],
        maxSkip: 10,
      },);
      expect(dec.plaintext,).toBe(`msg-${i}`,);
      expect(payloads[i]!.counter,).toBe(i,);
      bState = dec.state;
    }
    expect(bState.recvCount,).toBe(5,);
  });

  test("skipped-key retention: late message uses stored skipped key", async () => {
    const { aliceState, aliceInitialPubJwk, bobState, } = await setupAliceBob();
    const { payloads, } = await aliceSendsN(aliceState, 4,);

    // Bob receives payload[0], payload[2], payload[3] out of order (skips 1)
    let bState = bobKnowsAlice(bobState, aliceInitialPubJwk,);
    const dec0 = await dhRatchetDecrypt({
      state: bState,
      payload: payloads[0]!,
      skippedKeys: [],
      maxSkip: 10,
    },);
    bState = dec0.state;

    // Receive payload[2] — should trigger skipped-key retention for payload[1]
    const dec2 = await dhRatchetDecrypt({
      state: bState,
      payload: payloads[2]!,
      skippedKeys: [],
      maxSkip: 10,
    },);
    expect(dec2.plaintext,).toBe("msg-2",);
    expect(dec2.newSkippedKeys.length,).toBe(1,);

    const dec3 = await dhRatchetDecrypt({
      state: dec2.state,
      payload: payloads[3]!,
      skippedKeys: [],
      maxSkip: 10,
    },);
    expect(dec3.plaintext,).toBe("msg-3",);

    // Now receive the late payload[1] using the stored skipped key
    const dec1 = await dhRatchetDecrypt({
      state: dec3.state,
      payload: payloads[1]!,
      skippedKeys: dec2.newSkippedKeys,
      maxSkip: 10,
    },);
    expect(dec1.plaintext,).toBe("msg-1",);
    expect(dec1.consumedSkippedKeyIds.length,).toBe(1,);
  });

  test("maxSkip guard: payload too far ahead throws", async () => {
    const { aliceState, aliceInitialPubJwk, bobState, } = await setupAliceBob();
    const { payloads, } = await aliceSendsN(aliceState, 10,);

    // Bob receives payload[9] first with maxSkip=2 — should throw
    await expect(dhRatchetDecrypt({
      state: bobKnowsAlice(bobState, aliceInitialPubJwk,),
      payload: payloads[9]!,
      skippedKeys: [],
      maxSkip: 2,
    },),).rejects.toThrow(/exceeds maxSkip/,);
  });

  test("counter regression without skipped-key throws", async () => {
    const { aliceState, aliceInitialPubJwk, bobState, } = await setupAliceBob();
    const { payloads, } = await aliceSendsN(aliceState, 3,);

    let bState = bobKnowsAlice(bobState, aliceInitialPubJwk,);
    const dec = await dhRatchetDecrypt({
      state: bState,
      payload: payloads[2]!,
      skippedKeys: [],
      maxSkip: 10,
    },);
    bState = dec.state;

    // Now replay payload[0] — counter behind current recvCount, no skipped
    // key provided. Should throw.
    await expect(dhRatchetDecrypt({
      state: bState,
      payload: payloads[0]!,
      skippedKeys: [],
      maxSkip: 10,
    },),).rejects.toThrow(/behind current recvCount/,);
  });

  test("tamper detection: ciphertext flip throws auth-tag mismatch", async () => {
    const { aliceState, aliceInitialPubJwk, bobState, } = await setupAliceBob();
    const enc = await dhRatchetEncrypt({ state: aliceState, plaintext: "secret", },);

    // Flip a bit in the ciphertext
    const ctBytes = Uint8Array.from(
      atob(enc.payload.ciphertext,),
      (c,) => c.charCodeAt(0,),
    );
    ctBytes[0]! ^= 0x01;
    const tampered: DhMessagePayload = {
      ...enc.payload,
      ciphertext: btoa(String.fromCharCode(...ctBytes,),),
    };

    await expect(dhRatchetDecrypt({
      state: bobKnowsAlice(bobState, aliceInitialPubJwk,),
      payload: tampered,
      skippedKeys: [],
      maxSkip: 10,
    },),).rejects.toThrow();
  });

  test("init: both sides produce same initial chain key from same root", async () => {
    const aliceIdentity = await generateKeyPair();
    const bobIdentity = await generateKeyPair();
    const rootKey = crypto.getRandomValues(new Uint8Array(32,),);

    const a = await initDhRatchet({ rootKey, theirInitialPub: bobIdentity.publicKey, },);
    const b = await initDhRatchet({ rootKey, theirInitialPub: aliceIdentity.publicKey, },);

    expect(Buffer.from(a.state.sendingChainKey,).toString("hex",),)
      .toBe(Buffer.from(b.state.receivingChainKey,).toString("hex",),);
    expect(Buffer.from(a.state.sendingChainKey,).toString("hex",),)
      .toBe(Buffer.from(b.state.sendingChainKey,).toString("hex",),);
  });

  test("rootKey byte length validation: throws on wrong size", async () => {
    const aliceIdentity = await generateKeyPair();
    await expect(initDhRatchet({
      rootKey: new Uint8Array(16,), // too short
      theirInitialPub: aliceIdentity.publicKey,
    },),).rejects.toThrow(/must be 32 bytes/,);
  });
});
