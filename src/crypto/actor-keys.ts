// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 302

/**
 * Actor Key CRUD
 *
 * Generate, load, rotate, and revoke actor encryption keys.
 * Keys are stored in `actor_keys` table, encrypted at rest by SMK.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";

const IV_LENGTH = 12; // 96-bit nonce for GCM

// ── Types ──────────────────────────────────────────────────

/** */
export interface ActorKeyData {
  keyId: string;
  actorId: string;
  rawKey: Uint8Array; // 32 bytes, decrypted from storage
  name: string;
  status: string;
}

/** */
export interface ActorKeyMeta {
  id: string;
  actorId: string;
  name: string;
  keyType: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

// ── Options-object interfaces ────────────────────────────────

/** */
export interface GenerateActorKeyOpts {
  database: Kysely<DB>;
  actorId: string;
  smk: CryptoKey;
  name?: string;
}

/** */
export interface EnsureActorKeyOpts {
  database: Kysely<DB>;
  actorId: string;
  smk: CryptoKey;
}

/** */
export interface LoadActorKeysOpts {
  database: Kysely<DB>;
  actorIds: string[];
  smk: CryptoKey;
}

/** */
export interface GetActorKeyOpts {
  database: Kysely<DB>;
  keyId: string;
  smk: CryptoKey;
}

// ── Internal helpers ───────────────────────────────────────

/**
 * @param smk
 * @param rawKey
 */
function encryptWithSmk(smk: CryptoKey, rawKey: Uint8Array,): Promise<string> {
  return encryptBytes(smk, rawKey,);
}

/**
 * @param smk
 * @param encryptedValue
 */
async function decryptWithSmk(smk: CryptoKey, encryptedValue: string,): Promise<Uint8Array> {
  return decryptBytes(smk, encryptedValue,);
}

/**
 * @param key
 * @param plaintext
 */
export async function encryptBytes(key: CryptoKey, plaintext: Uint8Array,): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH,),);
  const input = toBufferSource(plaintext,);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, }, key, input,);
  const ivB64 = new Uint8Array(iv,).toBase64();
  const ctB64 = new Uint8Array(ciphertext,).toBase64();
  return `${ivB64}:${ctB64}`;
}

/**
 * @param key
 * @param encrypted
 */
export async function decryptBytes(key: CryptoKey, encrypted: string,): Promise<Uint8Array> {
  if (!encrypted) { throw new Error("decryptBytes: encrypted value is empty",); }
  // sonarjs false positive: !encrypted guard on line above

  const parts = encrypted.split(":",);
  if (parts.length !== 2) { throw new Error("Invalid encrypted key format",); }
  const iv = toBufferSource(Uint8Array.fromBase64(parts[0]!,),);
  const data = toBufferSource(Uint8Array.fromBase64(parts[1]!,),);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, }, key, data,);
  return new Uint8Array(plaintext,);
}
/**
 * Workaround for Bun's Uint8Array generics vs Web Crypto BufferSource.
 * @param arr
 */
function toBufferSource(arr: Uint8Array,): Uint8Array<ArrayBuffer> {
  return arr as unknown as Uint8Array<ArrayBuffer>;
}

// ── CRUD Operations ─────────────────────────────────────────

/**
 * Generate a new 256-bit AES key for an actor, encrypt with SMK, store in DB.
 * @param root0
 * @param root0.database
 * @param root0.actorId
 * @param root0.smk
 * @param root0.name
 * @returns The new key's ID.
 */
export async function generateActorKey({
  database,
  actorId,
  smk,
  name = "primary",
}: GenerateActorKeyOpts,): Promise<string> {
  const id = uid();
  const rawKey = crypto.getRandomValues(new Uint8Array(32,),);
  const encryptedKey = await encryptWithSmk(smk, rawKey,);

  await database
    .insertInto("actor_keys",)
    .values({
      id,
      actor_id: actorId,
      name,
      key_type: "primary",
      encrypted_key: encryptedKey,
      status: "active",
    },)
    .execute();

  return id;
}

/**
 * Ensure an actor has at least one active primary key.
 * If not, generate one.
 * @param root0
 * @param root0.database
 * @param root0.actorId
 * @param root0.smk
 * @returns The active key's ID.
 */
export async function ensureActorKey({ database, actorId, smk, }: EnsureActorKeyOpts,): Promise<string> {
  const existing = await database
    .selectFrom("actor_keys",)
    .select("id",)
    .where("actor_id", "=", actorId,)
    .where("status", "=", "active",)
    .executeTakeFirst();

  if (existing) { return existing.id; }

  return generateActorKey({ database, actorId, smk, },);
}

/**
 * Load and decrypt all active actor keys for a set of actor IDs.
 *
 * Returns keys sorted by actor_id for deterministic HKDF input.
 * @param root0
 * @param root0.database
 * @param root0.actorIds
 * @param root0.smk
 */
export async function loadActorKeys({ database, actorIds, smk, }: LoadActorKeysOpts,): Promise<ActorKeyData[]> {
  if (actorIds.length === 0) { return []; }

  const rows = await database
    .selectFrom("actor_keys",)
    .selectAll()
    .where("actor_id", "in", actorIds,)
    .where("status", "=", "active",)
    .orderBy("actor_id", "asc",)
    .execute();

  const results: ActorKeyData[] = [];
  for (const row of rows) {
    if (!row.encrypted_key) { continue; }
    const rawKey = await decryptWithSmk(smk, row.encrypted_key,);
    results.push({
      keyId: row.id,
      actorId: row.actor_id,
      rawKey,
      name: row.name,
      status: row.status,
    },);
  }

  return results;
}

/**
 * Get a single key by ID (for key_id lookup on message read).
 * @param root0
 * @param root0.database
 * @param root0.keyId
 * @param root0.smk
 */
export async function getActorKey({ database, keyId, smk, }: GetActorKeyOpts,): Promise<ActorKeyData | null> {
  const row = await database.selectFrom("actor_keys",).selectAll().where("id", "=", keyId,).executeTakeFirst();

  if (!row?.encrypted_key) { return null; }

  const rawKey = await decryptWithSmk(smk, row.encrypted_key,);
  return {
    keyId: row.id,
    actorId: row.actor_id,
    rawKey,
    name: row.name,
    status: row.status,
  };
}

/**
 * Rotate an actor's primary key.
 * Old key → status "expired". New key → "primary".
 * @param root0
 * @param root0.database
 * @param root0.actorId
 * @param root0.smk
 * @returns The new key ID.
 */
export async function rotateActorKey({ database, actorId, smk, }: GenerateActorKeyOpts,): Promise<string> {
  // Expire all current active keys for this actor
  await database
    .updateTable("actor_keys",)
    .set({
      status: "expired",
      expires_at: new Date().toISOString(),
    },)
    .where("actor_id", "=", actorId,)
    .where("status", "=", "active",)
    .execute();

  // Generate new key
  return generateActorKey({ database, actorId, smk, name: "primary", },);
}

/**
 * Revoke a specific key by ID. Irreversible.
 * @param database
 * @param keyId
 */
export async function revokeActorKey(database: Kysely<DB>, keyId: string,): Promise<void> {
  await database.updateTable("actor_keys",).set({ status: "revoked", },).where("id", "=", keyId,).execute();
}

/**
 * List all keys for an actor (metadata only, no key material).
 * @param database
 * @param actorId
 */
export async function listActorKeys(database: Kysely<DB>, actorId: string,): Promise<ActorKeyMeta[]> {
  const rows = await database
    .selectFrom("actor_keys",)
    .select(["id", "actor_id", "name", "key_type", "status", "created_at", "expires_at",],)
    .where("actor_id", "=", actorId,)
    .orderBy("created_at", "desc",)
    .execute();

  return Array.from(rows, (r,) => ({
    id: r.id,
    actorId: r.actor_id,
    name: r.name,
    keyType: r.key_type,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }),);
}
