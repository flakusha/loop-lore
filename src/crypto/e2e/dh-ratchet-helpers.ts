// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Helpers extracted from `dh-ratchet.ts`
 * (TASK-asymmetric-key-pairs-followup §Phase B):
 *
 *   - `SkippedKey` shape + `skipOldChain` derivation — separated so the
 *     state machine can stay focused on the protocol flow.
 *
 * Note on the size split: the rest of `dh-ratchet.ts` (state machine +
 * `initDhRatchet` / `dhRatchetEncrypt` / `dhRatchetDecrypt`) cannot be
 * cleanly factored further. Every other function mutates or threads
 * `DhRatchetState` and pulling the type definitions out would create a
 * circular import (helpers would need `DhRatchetState` from
 * `dh-ratchet.ts`, which already needs `SkippedKey` from here). The
 * 13L of `DhRatchetDecryptOpts`/`DhRatchetDecryptResult` interfaces stay
 * inline for the same reason.
 *
 * Primitives: `./dh-ratchet-primitives.ts`.
 */
import { chainStep, } from "./dh-ratchet-primitives";

/** A retained message key from a gap in the receiving chain. */
export interface SkippedKey {
  id: string;
  ephemeralPublicJwk: JsonWebKey;
  counter: number;
  messageKeyBytes: Uint8Array;
}

/**
 * Step `state.receivingChainKey` forward `untilCounter` times, recording
 * each derived message key as a `SkippedKey` for late delivery. Returns
 * `[]` when `untilCounter === 0` (the common case of no gaps).
 *
 * Pure on `state`: reads `state.receivingChainKey`, `state.recvCount`,
 * and `state.theirCurrentPubJwk`. Does not mutate the input.
 * @param state
 * @param untilCounter
 */
export async function skipOldChain(state: DhRatchetStateReadonly, untilCounter: number,): Promise<SkippedKey[]> {
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

/** Minimal read-only view of `DhRatchetState` consumed by `skipOldChain`. */
export interface DhRatchetStateReadonly {
  receivingChainKey: Uint8Array;
  recvCount: number;
  theirCurrentPubJwk: JsonWebKey | null;
}
