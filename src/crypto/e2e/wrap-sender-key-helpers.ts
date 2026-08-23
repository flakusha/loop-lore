// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Helpers extracted from `wrap-sender-key.ts`:
 *
 *   - Domain separators / sizes: `WRAP_INFO`, `AAD_PREFIX`, `KEY_LENGTH`,
 *     `WRAP_NONCE_LENGTH`.
 *   - Pure crypto primitives: `wrapAad`, `hkdfExpandToBytes`.
 *   - Public option / result types consumed by the protocol functions:
 *     `RecipientWrap`, `WrapSenderKeyOpts`, `UnwrapSenderKeyOpts`.
 *
 * Split rationale: the protocol logic in `wrap-sender-key.ts`
 * (`wrapSenderKey`, `unwrapSenderKey`, plus the DB helpers
 * `recordGroupWrap` / `latestGroupWrapForRecipient`) crosses three
 * concerns — ECDH wrap, AES-GCM seal, and `e2e_group_wraps` persistence.
 * Pulling the constants + the AAD builder + the HKDF expand step into
 * a separate file keeps the protocol module focused on the flow.
 *
 * No state mutation; safe to import from anywhere in this package.
 */

export const WRAP_INFO = "loop-lore-e2e-sender-key-wrap-v1" as const;
export const AAD_PREFIX = "loop-lore-e2e-sender-key-aad-v1" as const;
export const KEY_LENGTH = 32;
export const WRAP_NONCE_LENGTH = 12;

export function wrapAad(recipientActorId: string,): Uint8Array {
  return new TextEncoder().encode(`${AAD_PREFIX}:${recipientActorId}`,);
}

export async function hkdfExpandToBytes(
  sharedBytes: Uint8Array,
  info: string,
  outLen: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(sharedBytes,).buffer as ArrayBuffer,
    "HKDF",
    false,
    ["deriveBits",],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0,),
      info: new TextEncoder().encode(info,),
    },
    base,
    outLen * 8,
  );
  return new Uint8Array(bits,);
}

export interface RecipientWrap {
  recipientActorId: string;
  /**
   * base64. `<nonce_b64>"."<ct_b64>` — AES-GCM ciphertext of the chain
   * key under the per-recipient wrap key, with the recipient actor id
   * bound as AAD.
   */
  wrappedKey: string;
  /** Per-recipient ephemeral ECDH public key (JWK). */
  senderEphPubJwk: JsonWebKey;
}

export interface WrapSenderKeyOpts {
  chainKey: Uint8Array;
  recipients: { actorId: string; staticPubJwk: JsonWebKey }[];
}

export interface UnwrapSenderKeyOpts {
  wrappedKey: string;
  senderEphPubJwk: JsonWebKey;
  recipientStaticPriv: CryptoKey;
  recipientActorId: string;
}