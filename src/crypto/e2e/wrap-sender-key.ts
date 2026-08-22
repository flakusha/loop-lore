// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group Sender-Key Wrap (TASK-asymmetric-key-pairs-followup — Phase C)
 *
 * The sender of a group message chooses ONE 32-byte sender chain key per
 * outgoing message (random, fresh per send). For each intended recipient,
 * the sender wraps the chain key so only they can recover it AND so a
 * wrong-recipient unwrap fails authentication (not silently returns
 * garbage):
 *
 *   wrap(recipient, chainKey):
 *     1. eph = ECDH.generateKeyPair()
 *     2. shared = ECDH(eph.priv, recipient.static.pub)
 *     3. keystream = HKDF-Expand(shared, info="loop-lore-e2e-sender-key-wrap-v1")
 *     4. nonce = 12 random bytes
 *     5. aad = "loop-lore-e2e-sender-key-wrap-aad-v1:<recipientActorId>"
 *     6. ciphertext = AES-GCM(keystream-as-key, nonce, aad, chainKey)
 *     7. wire = nonce_b64 "." ct_b64
 *
 *   unwrap(wire, senderEphPubJwk, myStatic.priv, recipientActorId):
 *     1. shared = ECDH(myStatic.priv, senderEph)
 *     2. keystream = HKDF-Expand(shared, info=...)
 *     3. AES-GCM-decrypt(keystream-as-key, nonce, aad, ct) — throws on
 *        auth-tag mismatch (wrong recipient or tampered wire)
 *
 * Forward secrecy of the chain key:
 *   Each message uses a fresh random chain key. The CHAIN KEY for
 *   message N is sealed by the per-message ECDH ephem of message N;
 *   past chain keys (and therefore past message keys) cannot be
 *   recovered from a future long-term-key compromise, because past
 *   ephem priv keys were discarded.
 *
 * Out of scope:
 *   - Persistent sender-side chain state across messages (caller
 *     generates a fresh chain key per send — a per-chain counter is
 *     the optimization in a follow-up).
 *   - Membership rekey on join/leave (caller rotates by bumping
 *     `chainIndex` so future sends use a fresh chain key; past
 *     ciphertexts are NOT re-encrypted for new joiners).
 */

import type { Kysely, } from "kysely";

import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

const WRAP_INFO = "loop-lore-e2e-sender-key-wrap-v1" as const;
const AAD_PREFIX = "loop-lore-e2e-sender-key-wrap-aad-v1" as const;
const KEY_LENGTH = 32;
const WRAP_NONCE_LENGTH = 12;

function wrapAad(recipientActorId: string,): Uint8Array {
  return new TextEncoder().encode(`${AAD_PREFIX}:${recipientActorId}`,);
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

export async function wrapSenderKey(
  opts: WrapSenderKeyOpts,
): Promise<RecipientWrap[]> {
  if (opts.chainKey.byteLength !== KEY_LENGTH) {
    throw new Error(`chainKey must be ${KEY_LENGTH} bytes (got ${opts.chainKey.byteLength})`);
  }
  const wraps: RecipientWrap[] = [];
  for (const recipient of opts.recipients) {
    const eph = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256", },
      true,
      ["deriveBits",],
    );
    const theirPub = await crypto.subtle.importKey(
      "jwk",
      recipient.staticPubJwk,
      { name: "ECDH", namedCurve: "P-256", },
      false,
      [],
    );
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: theirPub, },
      eph.privateKey,
      KEY_LENGTH * 8,
    );
    const shared = new Uint8Array(sharedBits,);
    const keystream = await hkdfExpandToBytes(shared, WRAP_INFO, KEY_LENGTH,);
    const wrapKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(keystream,).buffer as ArrayBuffer,
      "AES-GCM",
      false,
      ["encrypt",],
    );
    const wrapNonce = crypto.getRandomValues(
      new Uint8Array(WRAP_NONCE_LENGTH,),
    );
    const aad = wrapAad(recipient.actorId,);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(wrapNonce,).buffer as ArrayBuffer,
          additionalData: new Uint8Array(aad,).buffer as ArrayBuffer,
        },
        wrapKey,
        new Uint8Array(opts.chainKey,).buffer as ArrayBuffer,
      ),
    );
    const packed = `${wrapNonce.toBase64()}.${ct.toBase64()}`;
    const senderEphPubJwk = await crypto.subtle.exportKey(
      "jwk",
      eph.publicKey,
    );
    wraps.push({
      recipientActorId: recipient.actorId,
      wrappedKey: packed,
      senderEphPubJwk,
    },);
  }
  return wraps;
}

export async function unwrapSenderKey(
  opts: UnwrapSenderKeyOpts,
): Promise<Uint8Array> {
  const senderEphPub = await crypto.subtle.importKey(
    "jwk",
    opts.senderEphPubJwk,
    { name: "ECDH", namedCurve: "P-256", },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: senderEphPub, },
    opts.recipientStaticPriv,
    KEY_LENGTH * 8,
  );
  const shared = new Uint8Array(sharedBits,);
  const keystream = await hkdfExpandToBytes(shared, WRAP_INFO, KEY_LENGTH,);
  const parts = opts.wrappedKey.split(".",);
  if (parts.length !== 2) {
    throw new Error("wrap wire format invalid: expected `<nonce_b64>.<ct_b64>`");
  }
  const [nonceB64, ctB64] = parts as [string, string];
  const wrapNonce = Uint8Array.fromBase64(nonceB64,);
  const ct = Uint8Array.fromBase64(ctB64,);
  if (wrapNonce.byteLength !== WRAP_NONCE_LENGTH) {
    throw new Error(`wrap nonce must be ${WRAP_NONCE_LENGTH} bytes`);
  }
  const wrapKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(keystream,).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["decrypt",],
  );
  const aad = wrapAad(opts.recipientActorId,);
  // Throws OperationError on auth-tag mismatch (wrong key OR wrong actor id).
  const pt = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(wrapNonce,).buffer as ArrayBuffer,
        additionalData: new Uint8Array(aad,).buffer as ArrayBuffer,
      },
      wrapKey,
      new Uint8Array(ct,).buffer as ArrayBuffer,
    ),
  );
  if (pt.byteLength !== KEY_LENGTH) {
    throw new Error(`unwrapped chain key must be ${KEY_LENGTH} bytes`);
  }
  return pt;
}

async function hkdfExpandToBytes(
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

// ── Server-side helpers (e2e_group_wraps table) ─────────────

export interface GroupWrapRow {
  id: string;
  groupSessionId: string;
  recipientActorId: string;
  wrappedKey: string;
  senderEphPubJwk: string;
  chainIndex: number;
}

export interface RecordGroupWrapRowOpts {
  database: Kysely<DB>;
  groupSessionId: string;
  recipientActorId: string;
  wrappedKey: string;
  senderEphPubJwk: JsonWebKey;
  chainIndex: number;
}

export async function recordGroupWrap(
  opts: RecordGroupWrapRowOpts,
): Promise<GroupWrapRow> {
  const id = uid();
  await opts.database
    .insertInto("e2e_group_wraps",)
    .values({
      id,
      group_session_id: opts.groupSessionId,
      recipient_actor_id: opts.recipientActorId,
      wrapped_key: opts.wrappedKey,
      sender_eph_pub_jwk: JSON.stringify(opts.senderEphPubJwk,),
      chain_index: opts.chainIndex,
    },)
    .execute();
  return {
    id,
    groupSessionId: opts.groupSessionId,
    recipientActorId: opts.recipientActorId,
    wrappedKey: opts.wrappedKey,
    senderEphPubJwk: JSON.stringify(opts.senderEphPubJwk,),
    chainIndex: opts.chainIndex,
  };
}

export async function latestGroupWrapForRecipient(
  database: Kysely<DB>,
  groupSessionId: string,
  recipientActorId: string,
): Promise<GroupWrapRow | null> {
  const row = await database
    .selectFrom("e2e_group_wraps",)
    .selectAll()
    .where("group_session_id", "=", groupSessionId,)
    .where("recipient_actor_id", "=", recipientActorId,)
    .orderBy("chain_index", "desc",)
    .limit(1,)
    .executeTakeFirst();
  return row
    ? {
        id: row.id,
        groupSessionId: row.group_session_id,
        recipientActorId: row.recipient_actor_id,
        wrappedKey: row.wrapped_key,
        senderEphPubJwk: row.sender_eph_pub_jwk,
        chainIndex: row.chain_index,
      }
    : null;
}
