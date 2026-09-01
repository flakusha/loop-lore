// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Double Ratchet — DH + chain-key + skipped-key retention
 * (TASK-asymmetric-key-pairs-followup §Phase B).
 *
 * Bounded subset of the Signal Double Ratchet for 1:1 chat: DH step on
 * a new ephemeral (post-compromise), chain step per message, bounded
 * skipped-key retention, and separate sending/receiving chains.
 *
 * Out of scope: async pre-keys (bootstrap via init exchange), group
 * sender-key (Phase C).
 *
 * Primitives: `./dh-ratchet-primitives.ts`. Helpers (`skipOldChain`,
 * `SkippedKey`): `./dh-ratchet-helpers.ts`.
 */
import { toBase64, } from "../../utils/base64";
import { skipOldChain, type SkippedKey, } from "./dh-ratchet-helpers";
import type { DhMessagePayload, } from "./dh-ratchet-primitives";
import {
  canonicalJwk,
  chainStep,
  decryptWithMessageKey,
  deriveChainKeyFromRoot,
  dhStep,
  KEY_BYTES,
} from "./dh-ratchet-primitives";

/** */
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

/** */
export interface InitDhRatchetOpts {
  rootKey: Uint8Array;
}

// theirInitialPub was previously declared here but never used: the
// ECDH agreement producing rootKey occurs upstream (deriveSharedSecret),
// and the initial chain key is derived deterministically from rootKey.
/** */
export interface InitDhRatchetResult {
  state: DhRatchetState;
  myInitialPubJwk: JsonWebKey;
}
/**
 * @param opts
 */
export async function initDhRatchet(opts: InitDhRatchetOpts,): Promise<InitDhRatchetResult> {
  if (opts.rootKey.byteLength !== KEY_BYTES) {
    throw new Error(`rootKey must be ${KEY_BYTES} bytes (got ${opts.rootKey.byteLength})`,);
  }
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

/** */
export interface DhRatchetEncryptOpts {
  state: DhRatchetState;
  plaintext: string;
}

/** */
export interface DhRatchetEncryptResult {
  state: DhRatchetState;
  payload: DhMessagePayload;
}

/**
 * @param opts
 */
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

/** */
export interface DhRatchetDecryptOpts {
  state: DhRatchetState;
  payload: DhMessagePayload;
  skippedKeys: ReadonlyArray<SkippedKey>;
  maxSkip: number;
}

/** */
export interface DhRatchetDecryptResult {
  plaintext: string;
  state: DhRatchetState;
  consumedSkippedKeyIds: string[];
  newSkippedKeys: SkippedKey[];
}

/**
 * @param opts
 */
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

  // 2. Clone state (avoid mutating caller's input — aliasing hazard).
  let workingState: DhRatchetState = {
    ...state,
    receivingChainKey: new Uint8Array(state.receivingChainKey,),
    myEphemeralPubJwk: { ...state.myEphemeralPubJwk, },
    theirCurrentPubJwk: state.theirCurrentPubJwk === null ? null : { ...state.theirCurrentPubJwk, },
  };
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
    // Re-seed chainKey from the NEW epoch's chain (dh.sendingChainKey), not
    // the previous epoch's receivingChainKey captured before the DH step.
    // Without this re-seed the chain-advance loop derives the message key
    // from the stale chain and AES-GCM auth fails. The fresh copy is
    // required (not a reference assignment) because workingState.receivingChainKey
    // (aliasing dh.sendingChainKey) gets fill(0)'d at the end of this function;
    // sharing that buffer with chainKey would zero the new epoch's chain
    // material before it is returned in the new state.
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
