// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Double Ratchet — DH + chain-key + skipped-key retention
 * (TASK-asymmetric-key-pairs-followup §Phase B).
 *
 * Bounded subset of the Signal Double Ratchet for 1:1 chat:
 *   - DH step on new ephemeral (post-compromise security)
 *   - Chain step per message (within a chain)
 *   - Skipped-key retention (bounded; server-side buffer)
 *   - Two separate chains (sending + receiving)
 *
 * Out of scope:
 *   - Asynchronous pre-keys — bootstrap via init exchange.
 *   - Group chat sender-key — Phase C.
 *
 * Crypto primitives live in `./dh-ratchet-primitives.ts`.
 */
import { toBase64, } from "../../utils/base64";
import type { DhMessagePayload, } from "./dh-ratchet-primitives.ts";
import {
  canonicalJwk,
  chainStep,
  decryptWithMessageKey,
  deriveChainKeyFromRoot,
  dhStep,
  KEY_BYTES,
} from "./dh-ratchet-primitives.ts";

export interface DhRatchetState {
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  myEphemeralPriv: CryptoKey;
  myEphemeralPubJwk: JsonWebKey;
  theirCurrentPubJwk: JsonWebKey | null;
  sendCount: number;
  recvCount: number;
}

export interface InitDhRatchetOpts {
  rootKey: Uint8Array;
  theirInitialPub: CryptoKey;
}

export interface InitDhRatchetResult {
  state: DhRatchetState;
  myInitialPubJwk: JsonWebKey;
}

export async function initDhRatchet(opts: InitDhRatchetOpts,): Promise<InitDhRatchetResult> {
  if (opts.rootKey.byteLength !== KEY_BYTES) {
    throw new Error(`rootKey must be ${KEY_BYTES} bytes (got ${opts.rootKey.byteLength})`,);
  }
  // Initial chain key derived deterministically from the shared rootKey
  // (rootKey comes from the existing ECDH agreement in deriveSharedSecret).
  const chainKeyBits = await deriveChainKeyFromRoot(opts.rootKey,);
  const initialChainKey = new Uint8Array(chainKeyBits,) as Uint8Array<ArrayBuffer>;
  const myEphemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256", },
    true,
    ["deriveBits",],
  );
  const myInitialPubJwk = await crypto.subtle.exportKey("jwk", myEphemeral.publicKey,);
  return {
    state: {
      rootKey: opts.rootKey,
      sendingChainKey: initialChainKey,
      receivingChainKey: initialChainKey,
      myEphemeralPriv: myEphemeral.privateKey,
      myEphemeralPubJwk: myInitialPubJwk,
      theirCurrentPubJwk: null,
      sendCount: 0,
      recvCount: 0,
    },
    myInitialPubJwk,
  };
}

export interface DhRatchetEncryptOpts {
  state: DhRatchetState;
  plaintext: string;
}

export interface DhRatchetEncryptResult {
  state: DhRatchetState;
  payload: DhMessagePayload;
}

export async function dhRatchetEncrypt(opts: DhRatchetEncryptOpts,): Promise<DhRatchetEncryptResult> {
  const step = await chainStep(opts.state.sendingChainKey,);
  opts.state.sendingChainKey.fill(0,);
  const newState: DhRatchetState = {
    ...opts.state,
    sendingChainKey: step.nextChainKey,
    sendCount: opts.state.sendCount + 1,
  };
  const nonce = crypto.getRandomValues(new Uint8Array(12,),);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, },
    step.messageKey,
    new TextEncoder().encode(opts.plaintext,) as Uint8Array<ArrayBuffer>,
  );
  return {
    state: newState,
    payload: {
      ephemeralPublicJwk: newState.myEphemeralPubJwk,
      counter: newState.sendCount - 1,
      nonce: toBase64(nonce,),
      ciphertext: toBase64(new Uint8Array(ciphertext,) as Uint8Array<ArrayBuffer>,),
    },
  };
}

export interface DhRatchetDecryptOpts {
  state: DhRatchetState;
  payload: DhMessagePayload;
  skippedKeys: ReadonlyArray<SkippedKey>;
  maxSkip: number;
}

export interface DhRatchetDecryptResult {
  plaintext: string;
  state: DhRatchetState;
  consumedSkippedKeyIds: string[];
  newSkippedKeys: SkippedKey[];
}

export interface SkippedKey {
  id: string;
  ephemeralPublicJwk: JsonWebKey;
  counter: number;
  messageKeyBytes: Uint8Array;
}

export async function dhRatchetDecrypt(opts: DhRatchetDecryptOpts,): Promise<DhRatchetDecryptResult> {
  const { state, payload, } = opts;
  const ephemeralKey = canonicalJwk(payload.ephemeralPublicJwk,);

  // 1. Skipped-key lookup.
  const matchingSkip = opts.skippedKeys.find((sk,) =>
    sk.counter === payload.counter && canonicalJwk(sk.ephemeralPublicJwk,) === ephemeralKey
  );
  if (matchingSkip) {
    return {
      plaintext: await decryptWithMessageKey(matchingSkip.messageKeyBytes, payload,),
      state,
      consumedSkippedKeyIds: [matchingSkip.id,],
      newSkippedKeys: [],
    };
  }

  // 2. Chain advancement: either a new ephemeral (DH step + fresh chain) or
  //    a continuation of the current chain (counter advance only).
  let workingState = state;
  let newSkippedKeys: SkippedKey[] = [];
  let recvCountAdvance = 0;
  let chainKey: Uint8Array = new Uint8Array(workingState.receivingChainKey,);

  if (state.theirCurrentPubJwk === null || canonicalJwk(state.theirCurrentPubJwk,) !== ephemeralKey) {
    if (payload.counter > opts.maxSkip) {
      throw new Error(
        `dhRatchetDecrypt: payload is ${payload.counter} messages ahead, exceeds maxSkip=${opts.maxSkip}`,
      );
    }
    newSkippedKeys = [...await skipOldChain(state, payload.counter,),];
    const theirNewPub = await crypto.subtle.importKey(
      "jwk",
      payload.ephemeralPublicJwk,
      { name: "ECDH", namedCurve: "P-256", },
      false,
      [],
    );
    const dh = await dhStep(state.rootKey, state.myEphemeralPriv, theirNewPub,);
    workingState = {
      ...state,
      rootKey: dh.newRoot,
      receivingChainKey: dh.sendingChainKey,
      theirCurrentPubJwk: payload.ephemeralPublicJwk,
      recvCount: 0,
    };
    chainKey = new Uint8Array(workingState.receivingChainKey,);
  } else {
    recvCountAdvance = payload.counter - state.recvCount;
    if (recvCountAdvance < 0) {
      throw new Error(
        `dhRatchetDecrypt: payload counter ${payload.counter} is behind current recvCount ${state.recvCount}`,
      );
    }
    if (recvCountAdvance > opts.maxSkip) {
      throw new Error(
        `dhRatchetDecrypt: payload is ${recvCountAdvance} messages ahead, exceeds maxSkip=${opts.maxSkip}`,
      );
    }
  }

  // 3. Advance the receiving chain to the payload's counter.
  let messageKey: CryptoKey | null = null;
  let messageKeyBytes: Uint8Array | null = null;
  for (let i = 0; i <= recvCountAdvance; i++) {
    const step = await chainStep(chainKey,);
    chainKey.fill(0,);
    chainKey = step.nextChainKey;
    if (i === recvCountAdvance) {
      messageKey = step.messageKey;
      messageKeyBytes = step.messageKeyBytes;
    } else {
      newSkippedKeys.push({
        id: crypto.randomUUID(),
        ephemeralPublicJwk: payload.ephemeralPublicJwk,
        counter: payload.counter - (recvCountAdvance - i),
        messageKeyBytes: step.messageKeyBytes,
      },);
    }
  }
  if (!messageKey || !messageKeyBytes) {
    throw new Error("dhRatchetDecrypt: failed to derive message key (unreachable)",);
  }

  const plaintext = await decryptWithMessageKey(messageKeyBytes, payload,);
  workingState.receivingChainKey.fill(0,);
  workingState.receivingChainKey = chainKey;
  workingState.recvCount = payload.counter + 1;
  return { plaintext, state: workingState, consumedSkippedKeyIds: [], newSkippedKeys, };
}

async function skipOldChain(state: DhRatchetState, untilCounter: number,): Promise<SkippedKey[]> {
  if (untilCounter === 0) { return []; }
  const skipped: SkippedKey[] = [];
  let chainKey: Uint8Array = state.receivingChainKey;
  for (let i = 0; i < untilCounter; i++) {
    const step = await chainStep(chainKey,);
    chainKey.fill(0,);
    chainKey = step.nextChainKey;
    skipped.push({
      id: crypto.randomUUID(),
      ephemeralPublicJwk: state.theirCurrentPubJwk ?? { kty: "EC", },
      counter: state.recvCount + i,
      messageKeyBytes: step.messageKeyBytes,
    },);
  }
  return skipped;
}
