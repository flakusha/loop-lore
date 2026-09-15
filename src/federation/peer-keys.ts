// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-keys.ts — per-sender inbound content keys.
//
// Resilient P2P key design: instead of one mesh-wide PSK, every instance
// keeps a distinct inbound key per trusted sender origin. The sender learns
// the key from the `/api/mesh-reserve` response, which the reserve handler
// sends only over a sealed wire (direct server TLS or a TLS-terminating
// proxy) — over plaintext HTTP the key would ride the same wire as the
// ciphertexts it protects, so issuance falls back to the shared PSK there.
// This instance is the sole opener. Compromise of one key exposes one
// direction of one peering, and rotation is local + instant (no operator
// redeploy).
//
// Single-writer invariant: only the receiver generates/rotates its inbound
import type { Kysely, } from "kysely";
import { decryptBytes, encryptBytes, } from "../crypto/actor-key-bytes";
import type { DB, } from "../db/schema";
import { safeFromBase64, safeFromUint8Array, safeToBase64, } from "../utils/safe-buffer";
import { type ContentCipher, pskCipher, } from "./cipher";
import { canonicalOrigin, } from "./peer-fetch";

/** Raw key length (AES-256). */
export const INBOUND_KEY_BYTES = 32;

/**
 * Generate a fresh inbound key (base64 of 32 random bytes). Usable directly
 * as the `pskCipher` secret — HKDF derives the AES key from it.
 */
export function generateInboundKey(): string {
  const bytes = safeFromUint8Array(crypto.getRandomValues(new Uint8Array(INBOUND_KEY_BYTES,),),);
  if (!bytes.ok) { throw bytes.error; }
  const b64 = safeToBase64(bytes.buffer,);
  if (!b64.ok) { throw b64.error; }
  return b64.buffer;
}

/**
 * Lazily provision our inbound key for one sender: return the existing key
 * or generate, SMK-wrap, and store a new one.
 * @param database
 * @param smk Server master key for at-rest wrapping.
 * @param senderOrigin Canonical sender origin.
 * @returns Base64 key for the reserve response.
 */
export async function getOrCreateInboundKey(
  database: Kysely<DB>,
  smk: CryptoKey,
  senderOrigin: string,
): Promise<string> {
  const origin = canonicalOrigin(senderOrigin,);
  if (origin === null) { throw new Error(`invalid sender origin: ${senderOrigin}`,); }
  const row = await database
    .selectFrom("mesh_inbound_keys",)
    .select(["encrypted_key",],)
    .where("peer_origin", "=", origin,)
    .executeTakeFirst();
  if (row) {
    const plain = safeFromUint8Array(await decryptBytes(smk, row.encrypted_key,),);
    if (!plain.ok) { throw plain.error; }
    const b64 = safeToBase64(plain.buffer,);
    if (!b64.ok) { throw b64.error; }
    return b64.buffer;
  }
  const key = generateInboundKey();
  const wrap = safeFromBase64(key,);
  if (!wrap.ok) { throw wrap.error; }
  await database
    .insertInto("mesh_inbound_keys",)
    .values({ peer_origin: origin, encrypted_key: await encryptBytes(smk, wrap.buffer,), },)
    .onConflict((oc,) => oc.column("peer_origin",).doNothing())
    .execute();
  // Re-read: a concurrent reserve may have won the insert; either way the
  // stored key is authoritative — never hand out an unstored key.
  const raced = await database
    .selectFrom("mesh_inbound_keys",)
    .select(["encrypted_key",],)
    .where("peer_origin", "=", origin,)
    .executeTakeFirstOrThrow();
  const racedPlain = safeFromUint8Array(await decryptBytes(smk, raced.encrypted_key,),);
  if (!racedPlain.ok) { throw racedPlain.error; }
  const racedB64 = safeToBase64(racedPlain.buffer,);
  if (!racedB64.ok) { throw racedB64.error; }
  return racedB64.buffer;
}

/**
 * Rotate our inbound key for one sender: current becomes previous (grace),
 * a fresh key becomes current.
 * @param database
 * @param smk Server master key for at-rest wrapping.
 * @param senderOrigin Canonical sender origin.
 * @returns New base64 key.
 */
export async function rotateInboundKey(
  database: Kysely<DB>,
  smk: CryptoKey,
  senderOrigin: string,
): Promise<string> {
  const origin = canonicalOrigin(senderOrigin,);
  if (origin === null) { throw new Error(`invalid sender origin: ${senderOrigin}`,); }
  const row = await database
    .selectFrom("mesh_inbound_keys",)
    .select(["encrypted_key",],)
    .where("peer_origin", "=", origin,)
    .executeTakeFirst();
  const key = generateInboundKey();
  const keyBytes = safeFromBase64(key,);
  if (!keyBytes.ok) { throw keyBytes.error; }
  const encrypted = await encryptBytes(smk, keyBytes.buffer,);
  if (row) {
    await database
      .updateTable("mesh_inbound_keys",)
      .set({ encrypted_key: encrypted, previous_encrypted_key: row.encrypted_key, },)
      .where("peer_origin", "=", origin,)
      .execute();
    return key;
  }
  await database
    .insertInto("mesh_inbound_keys",)
    .values({ peer_origin: origin, encrypted_key: encrypted, },)
    .onConflict((oc,) => oc.column("peer_origin",).doNothing())
    .execute();
  // Re-read: a concurrent rotate may have won the insert; either way the
  // stored key is authoritative — never hand out an unstored key.
  const stored = await database
    .selectFrom("mesh_inbound_keys",)
    .select(["encrypted_key",],)
    .where("peer_origin", "=", origin,)
    .executeTakeFirstOrThrow();
  const storedPlain = safeFromUint8Array(await decryptBytes(smk, stored.encrypted_key,),);
  if (!storedPlain.ok) { throw storedPlain.error; }
  const storedB64 = safeToBase64(storedPlain.buffer,);
  if (!storedB64.ok) { throw storedB64.error; }
  return storedB64.buffer;
}
/**
 * Revoke our inbound key for one sender: delete current + grace previous.
 * Takes effect immediately — envelopes sealed under the revoked keys no
 * longer open (callers fall back to the shared PSK, if configured).
 * Revoking an unknown peer is a no-op success (idempotent).
 * @param database
 * @param senderOrigin Canonical sender origin.
 */
export async function revokeInboundKey(
  database: Kysely<DB>,
  senderOrigin: string,
): Promise<void> {
  const origin = canonicalOrigin(senderOrigin,);
  if (origin === null) { throw new Error(`invalid sender origin: ${senderOrigin}`,); }
  await database
    .deleteFrom("mesh_inbound_keys",)
    .where("peer_origin", "=", origin,)
    .execute();
}

/**
 * Ciphers that open this sender's envelopes: current first, then the grace
 * previous. Empty when no key was ever provisioned (caller falls back to
 * the shared PSK).
 * @param database
 * @param smk Server master key for at-rest wrapping.
 * @param senderOrigin Canonical sender origin.
 */
export async function inboundCiphers(
  database: Kysely<DB>,
  smk: CryptoKey,
  senderOrigin: string,
): Promise<ContentCipher[]> {
  const origin = canonicalOrigin(senderOrigin,);
  if (origin === null) { return []; }
  const row = await database
    .selectFrom("mesh_inbound_keys",)
    .select(["encrypted_key", "previous_encrypted_key",],)
    .where("peer_origin", "=", origin,)
    .executeTakeFirst();
  if (!row) { return []; }
  const encrypted = row.previous_encrypted_key !== null
    ? [row.encrypted_key, row.previous_encrypted_key,]
    : [row.encrypted_key,];
  const ciphers: ContentCipher[] = [];
  for (const value of encrypted) {
    const plain = safeFromUint8Array(await decryptBytes(smk, value,),);
    if (!plain.ok) { throw plain.error; }
    const b64 = safeToBase64(plain.buffer,);
    if (!b64.ok) { throw b64.error; }
    ciphers.push(pskCipher(b64.buffer,),);
  }
  return ciphers;
}

/**
 * Ciphers to try for one sender's envelope: its inbound keys when this
 * instance mints them (SMK available), else the shared-PSK fallback.
 * @param database
 * @param senderOrigin Envelope origin (self-asserted; must be trusted).
 * @param pskFallback Shared-PSK cipher for keyless operation.
 * @param smk Server master key, or null when encryption is disabled.
 */
export async function ciphersForSender(
  database: Kysely<DB>,
  senderOrigin: string,
  pskFallback: ContentCipher,
  smk: CryptoKey | null,
): Promise<ContentCipher[]> {
  if (smk === null) { return [pskFallback,]; }
  const keyed = await inboundCiphers(database, smk, senderOrigin,);
  return [...keyed, pskFallback,];
}
