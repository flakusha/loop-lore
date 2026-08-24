// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group Message Encrypt (TASK-asymmetric-key-pairs-followup — Phase C)
 *
 * Composes `wrap-sender-key` (per-recipient ECDH-wrap of the sender chain
 * key) with the symmetric ratchet (`./ratchet`) to produce a single wire
 * payload that any group participant can decrypt.
 *
 * Wire format:
 *   {
 *     ciphertext:     base64,
 *     nonce:          base64,
 *     chainIndex:     number,
 *     per_recipient: {
 *       [actorId: string]: { wrappedKey: base64, senderEphPubJwk: JWK }
 *     }
 *   }
 *
 * Threat model:
 *   - All group participants have the sender chain key once unwrapped.
 *   - Forward secrecy is one-message wide: a fresh chain key is generated
 *     per send (the previous message's chain key is discarded after the
 *     symmetric ratchet step to message key).
 *   - Server never holds the chain key — only the per-recipient wraps
 *     and the ciphertext.
 *
 * Limitation (documented v1):
 *   - No member-join re-keying in this iteration. A new joiner receives a
 *     wrap of the NEXT sender chain key, but past ciphertexts are NOT
 *     re-encrypted for them. They see only the future. Rotation on
 *     join/leave is added by updating the group session record to bump
 *     `chainIndex` so future messages use a fresh chain key.
 */

import { nextRatchetStep, } from "./ratchet";
import {
  unwrapSenderKey,
  wrapSenderKey,
} from "./wrap-sender-key";

const NONCE_LENGTH = 12;

export interface GroupEncryptOpts {
  plaintext: string;
  chainIndex: number;
  /**
   * Per-recipient static ECDH public keys (JWK). The encryption path
   * wraps the sender chain key to each of these.
   */
  recipients: { actorId: string; staticPubJwk: JsonWebKey }[];
}

export interface GroupDecryptOpts {
  payload: GroupEncryptedPayload;
  recipientActorId: string;
  recipientStaticPriv: CryptoKey;
}

export interface GroupEncryptedPayload {
  ciphertext: string;
  nonce: string;
  chainIndex: number;
  per_recipient: Record<string, { wrappedKey: string; senderEphPubJwk: JsonWebKey }>;
}

export async function encryptGroupMessage(
  opts: GroupEncryptOpts,
): Promise<GroupEncryptedPayload> {
  if (opts.recipients.length === 0) {
    throw new Error("encryptGroupMessage requires at least one recipient",);
  }
  const chainKey = crypto.getRandomValues(new Uint8Array(32,),);
  const wraps = await wrapSenderKey({
    chainKey,
    recipients: opts.recipients,
  },);
  const step = await nextRatchetStep(chainKey,);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH,),);
  const aes = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(step.messageKey,).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt",],
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonce,).buffer as ArrayBuffer, },
    aes,
    new TextEncoder().encode(opts.plaintext,).buffer as ArrayBuffer,
  );
  step.messageKey.fill(0,);
  const perRecipient: GroupEncryptedPayload["per_recipient"] = {};
  for (const wrap of wraps) {
    perRecipient[wrap.recipientActorId] = {
      wrappedKey: wrap.wrappedKey,
      senderEphPubJwk: wrap.senderEphPubJwk,
    };
  }
  return {
    ciphertext: new Uint8Array(ct,).toBase64(),
    nonce: nonce.toBase64(),
    chainIndex: opts.chainIndex,
    per_recipient: perRecipient,
  };
}

export async function decryptGroupMessage(
  opts: GroupDecryptOpts,
): Promise<string> {
  const wrap = opts.payload.per_recipient[opts.recipientActorId];
  if (!wrap) {
    throw new Error(
      `decryptGroupMessage: no wrap found for ${opts.recipientActorId}`,
    );
  }
  const chainKey = await unwrapSenderKey({
    wrappedKey: wrap.wrappedKey,
    senderEphPubJwk: wrap.senderEphPubJwk,
    recipientStaticPriv: opts.recipientStaticPriv,
    recipientActorId: opts.recipientActorId,
  },);
  const step = await nextRatchetStep(chainKey,);
  const aes = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(step.messageKey,).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["decrypt",],
  );
  const ct = Uint8Array.fromBase64(opts.payload.ciphertext,);
  const nonce = Uint8Array.fromBase64(opts.payload.nonce,);
  if (nonce.byteLength !== NONCE_LENGTH) {
    throw new Error(`nonce must be ${NONCE_LENGTH} bytes (got ${nonce.byteLength})`,);
  }
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonce,).buffer as ArrayBuffer, },
    aes,
    new Uint8Array(ct,).buffer as ArrayBuffer,
  );
  step.messageKey.fill(0,);
  return new TextDecoder().decode(pt,);
}

export function groupPayloadRecipients(
  payload: GroupEncryptedPayload,
): string[] {
  return Object.keys(payload.per_recipient,);
}
