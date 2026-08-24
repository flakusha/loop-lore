// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group Sender-Key Wrap — protocol + persistence
 * (TASK-asymmetric-key-pairs-followup — Phase C)
 *
 *   The sender of a group message chooses ONE 32-byte sender chain key
 *   per outgoing message (random, fresh per send). For each intended
 *   recipient, the sender wraps the chain key so only they can recover
 *   it AND so a wrong-recipient unwrap fails authentication (not
 *   silently returns garbage):
 *
 *   See `wrap-sender-key-helpers.ts` for the underlying constants,
 *   AAD builder, and HKDF-expand primitive; this file owns the
 *   `wrapSenderKey` / `unwrapSenderKey` protocol functions and the
 *   server-side persistence helpers (`recordGroupWrap`,
 *   `latestGroupWrapForRecipient`).
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
import { safeJsonStringify, uid, } from "../../utils";
import {
  hkdfExpandToBytes,
  KEY_LENGTH,
  WRAP_INFO,
  WRAP_NONCE_LENGTH,
  wrapAad,
} from "./wrap-sender-key-helpers";
import type {
  RecipientWrap,
  UnwrapSenderKeyOpts,
  WrapSenderKeyOpts,
} from "./wrap-sender-key-helpers";

// Re-export types so existing importers (`import { ... } from "./wrap-sender-key"`) keep working.
export type {
  RecipientWrap,
  UnwrapSenderKeyOpts,
  WrapSenderKeyOpts,
} from "./wrap-sender-key-helpers";

export async function wrapSenderKey(
  opts: WrapSenderKeyOpts,
): Promise<RecipientWrap[]> {
  if (opts.chainKey.byteLength !== KEY_LENGTH) {
    throw new Error(`chainKey must be ${KEY_LENGTH} bytes (got ${opts.chainKey.byteLength})`,);
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
    throw new Error("wrap wire format invalid: expected `<nonce_b64>.<ct_b64>`",);
  }
  const [nonceB64, ctB64,] = parts as [string, string,];
  const wrapNonce = Uint8Array.fromBase64(nonceB64,);
  const ct = Uint8Array.fromBase64(ctB64,);
  if (wrapNonce.byteLength !== WRAP_NONCE_LENGTH) {
    throw new Error(`wrap nonce must be ${WRAP_NONCE_LENGTH} bytes`,);
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
    throw new Error(`unwrapped chain key must be ${KEY_LENGTH} bytes`,);
  }
  return pt;
}

// ── Server-side helpers (e2e_group_wraps table) ────────────────────────────

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
  const ephPubJwkResult = safeJsonStringify(opts.senderEphPubJwk,);
  const senderEphPubJwkStr = ephPubJwkResult.ok ? ephPubJwkResult.value : "";
  await opts.database
    .insertInto("e2e_group_wraps",)
    .values({
      id,
      group_session_id: opts.groupSessionId,
      recipient_actor_id: opts.recipientActorId,
      wrapped_key: opts.wrappedKey,
      sender_eph_pub_jwk: senderEphPubJwkStr,
      chain_index: opts.chainIndex,
    },)
    .execute();
  return {
    id,
    groupSessionId: opts.groupSessionId,
    recipientActorId: opts.recipientActorId,
    wrappedKey: opts.wrappedKey,
    senderEphPubJwk: senderEphPubJwkStr,
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
