// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User Key Derivation — Argon2id Password-Based Keys
 *
 * Derives per-user encryption keys from a passphrase using Argon2id + HKDF.
 * Used for private-tier (E2E) encryption where the server never holds raw keys.
 *
 * Flow:
 *   1. User sets a passphrase → Argon2id hash stored in DB
 *   2. On login / key unlock → verify passphrase → derive 256-bit key via HKDF
 *   3. Derived key used for local encrypt/decrypt (browser-side E2E)
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";

// ── Constants ──────────────────────────────────────────────

const HKDF_INFO = "loop-lore-user-key-v1";
const HKDF_SALT_PREFIX = "loop-lore-user-key-salt-v1";

// ── Types ──────────────────────────────────────────────────

export interface UserKeyData {
  keyId: string;
  userId: string;
  rawKey: Uint8Array; // 32 bytes, derived from passphrase
  passphraseHash: string; // Argon2id hash for verification
}

export interface DeriveUserKeyOpts {
  database: Kysely<DB>;
  userId: string;
  passphrase: string;
}

export interface VerifyPassphraseOpts {
  database: Kysely<DB>;
  userId: string;
  passphrase: string;
}

export interface StoreUserKeyOpts {
  database: Kysely<DB>;
  userId: string;
  passphrase: string;
}

// ── Passphrase Verification ────────────────────────────────

/**
 * Verify a passphrase against the stored Argon2id hash.
 * Returns true if the passphrase matches.
 */
export async function verifyPassphrase(opts: VerifyPassphraseOpts,): Promise<boolean> {
  const { database, userId, passphrase, } = opts;

  const row = await database
    .selectFrom("actor_keys",)
    .select(["id", "encrypted_key",],)
    .where("actor_id", "=", userId,)
    .where("name", "=", "user-passphrase",)
    .where("status", "=", "active",)
    .executeTakeFirst();

  if (!row?.encrypted_key) { return false; }

  return Bun.password.verify(passphrase, row.encrypted_key,);
}

// ── Key Storage ────────────────────────────────────────────

/**
 * Store a user's passphrase hash and associated key metadata.
 * Called when a user sets their E2E passphrase for the first time.
 *
 * The passphrase hash is stored in `actor_keys.encrypted_key` (repurposed
 * field — for user keys this holds the Argon2id hash, not SMK-encrypted data).
 * The raw encryption key is never stored.
 */
export async function storeUserKey(opts: StoreUserKeyOpts,): Promise<string> {
  const { database, userId, passphrase, } = opts;

  // Hash passphrase with Argon2id
  const passphraseHash = await Bun.password.hash(passphrase, {
    algorithm: "argon2id",
    memoryCost: 65_536, // 64 MB
    timeCost: 3,
  },);

  // Check if key already exists
  const existing = await database
    .selectFrom("actor_keys",)
    .select("id",)
    .where("actor_id", "=", userId,)
    .where("name", "=", "user-passphrase",)
    .where("status", "=", "active",)
    .executeTakeFirst();

  if (existing) {
    // Update existing key
    await database
      .updateTable("actor_keys",)
      .set({ encrypted_key: passphraseHash, },)
      .where("id", "=", existing.id,)
      .execute();
    return existing.id;
  }

  // Create new key entry
  const keyId = uid();
  await database
    .insertInto("actor_keys",)
    .values({
      id: keyId,
      actor_id: userId,
      name: "user-passphrase",
      key_type: "encryption",
      encrypted_key: passphraseHash,
      status: "active",
    },)
    .execute();

  return keyId;
}

// ── Key Derivation ─────────────────────────────────────────

/**
 * Derive a 256-bit encryption key from a user's passphrase.
 *
 * Steps:
 *   1. Verify passphrase against stored Argon2id hash
 *   2. Use passphrase as IKM for HKDF-SHA256 → 32-byte key
 *
 * The HKDF step normalizes the passphrase entropy into a fixed-length
 * key suitable for AES-256-GCM.
 *
 * @throws If passphrase is incorrect or no key exists for the user.
 */
export async function deriveUserKey(opts: DeriveUserKeyOpts,): Promise<UserKeyData> {
  const { database, userId, passphrase, } = opts;

  // Verify passphrase
  const isValid = await verifyPassphrase({ database, userId, passphrase, },);
  if (!isValid) {
    throw new Error("Invalid passphrase",);
  }

  // Get key metadata
  const row = await database
    .selectFrom("actor_keys",)
    .select(["id", "encrypted_key",],)
    .where("actor_id", "=", userId,)
    .where("name", "=", "user-passphrase",)
    .where("status", "=", "active",)
    .executeTakeFirst();

  if (!row) {
    throw new Error("No user key found — call storeUserKey first",);
  }

  // Derive key via HKDF from passphrase
  const passphraseBytes = new TextEncoder().encode(passphrase,);
  const salt = new TextEncoder().encode(`${HKDF_SALT_PREFIX}:${userId}`,);
  const info = new TextEncoder().encode(HKDF_INFO,);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passphraseBytes,
    "HKDF",
    false,
    ["deriveKey",],
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256, },
    true,
    ["encrypt", "decrypt",],
  );

  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", derivedKey,),);

  return {
    keyId: row.id,
    userId,
    rawKey,
    passphraseHash: row.encrypted_key ?? "",
  };
}

// ── Revocation ─────────────────────────────────────────────

/**
 * Revoke a user's E2E key (e.g., on passphrase change or account compromise).
 * Irrevokes — old messages encrypted with derived key become undecryptable.
 */
export async function revokeUserKey(
  database: Kysely<DB>,
  userId: string,
): Promise<void> {
  await database
    .updateTable("actor_keys",)
    .set({ status: "revoked", },)
    .where("actor_id", "=", userId,)
    .where("name", "=", "user-passphrase",)
    .execute();
}

/**
 * Check if a user has an active E2E passphrase set.
 */
export async function hasUserKey(
  database: Kysely<DB>,
  userId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("actor_keys",)
    .select("id",)
    .where("actor_id", "=", userId,)
    .where("name", "=", "user-passphrase",)
    .where("status", "=", "active",)
    .executeTakeFirst();

  return !!row;
}
