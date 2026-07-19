/**
 * E2E Key Bundle — Private Tier Key Management
 *
 * Stores per-user encrypted chat key bundles for private-tier chats.
 * The server never holds raw private-tier chat keys — only encrypted bundles.
 *
 * Flow:
 *   1. Chat creator generates chat key, encrypts with their user key
 *   2. On invite: server stores key bundle for new participant
 *   3. Participant decrypts bundle with their user key to get chat key
 *   4. On leave: chat key rotated, new bundles created for remaining participants
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

// ── Types ──────────────────────────────────────────────────

export interface KeyBundle {
  /** Encrypted chat key (AES-256-GCM ciphertext, base64) */
  encryptedChatKey: string;
  /** IV/nonce used for encryption (base64) */
  iv: string;
  /** Key ID of the user key used to encrypt */
  userKeyId: string;
  /** Algorithm identifier */
  algorithm: "aes-256-gcm";
}

export interface StoreKeyBundleOpts {
  database: Kysely<DB>;
  chatId: string;
  userId: string;
  bundle: KeyBundle;
}

export interface LoadKeyBundleOpts {
  database: Kysely<DB>;
  chatId: string;
  userId: string;
}

// ── Bundle Encryption ──────────────────────────────────────

/**
 * Encrypt a chat key with a user's key for bundle storage.
 *
 * @param chatKeyRaw - The raw 32-byte chat key
 * @param userKey - The user's AES-256-GCM CryptoKey
 * @param userKeyId - The key ID of the user key
 * @returns Encrypted key bundle
 */
export async function encryptChatKeyForUser(
  chatKeyRaw: Uint8Array,
  userKey: CryptoKey,
  userKeyId: string,
): Promise<KeyBundle> {
  const iv = crypto.getRandomValues(new Uint8Array(12,),);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, },
    userKey,
    chatKeyRaw.buffer as ArrayBuffer,
  );

  return {
    encryptedChatKey: Buffer.from(encrypted,).toString("base64",),
    iv: Buffer.from(iv,).toString("base64",),
    userKeyId,
    algorithm: "aes-256-gcm",
  };
}

/**
 * Decrypt a chat key from a user's key bundle.
 *
 * @param bundle - The encrypted key bundle
 * @param userKey - The user's AES-256-GCM CryptoKey
 * @returns Raw 32-byte chat key
 */
export async function decryptChatKeyFromBundle(
  bundle: KeyBundle,
  userKey: CryptoKey,
): Promise<Uint8Array> {
  const iv = Buffer.from(bundle.iv, "base64",);
  const encrypted = Buffer.from(bundle.encryptedChatKey, "base64",);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, },
    userKey,
    encrypted,
  );

  return new Uint8Array(decrypted,);
}

// ── Bundle Storage ─────────────────────────────────────────

/**
 * Store an encrypted key bundle for a user in a private chat.
 * Uses upsert: overwrites existing bundle for the same chat+user.
 */
export async function storeKeyBundle(opts: StoreKeyBundleOpts,): Promise<string> {
  const { database, chatId, userId, bundle, } = opts;

  const existing = await database
    .selectFrom("actor_keys",)
    .select("id",)
    .where("actor_id", "=", userId,)
    .where("name", "=", `e2e-bundle:${chatId}`,)
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("actor_keys",)
      .set({ encrypted_key: JSON.stringify(bundle,), },)
      .where("id", "=", existing.id,)
      .execute();
    return existing.id;
  }

  const bundleId = uid();
  await database
    .insertInto("actor_keys",)
    .values({
      id: bundleId,
      actor_id: userId,
      name: `e2e-bundle:${chatId}`,
      key_type: "encryption",
      encrypted_key: JSON.stringify(bundle,),
      status: "active",
    },)
    .execute();

  return bundleId;
}

/**
 * Load an encrypted key bundle for a user in a private chat.
 */
export async function loadKeyBundle(
  opts: LoadKeyBundleOpts,
): Promise<KeyBundle | null> {
  const { database, chatId, userId, } = opts;

  const row = await database
    .selectFrom("actor_keys",)
    .select("encrypted_key",)
    .where("actor_id", "=", userId,)
    .where("name", "=", `e2e-bundle:${chatId}`,)
    .where("status", "=", "active",)
    .executeTakeFirst();

  if (!row?.encrypted_key) { return null; }

  try {
    return JSON.parse(row.encrypted_key,) as KeyBundle;
  } catch {
    return null;
  }
}

/**
 * Remove all key bundles for a chat (e.g., on chat deletion).
 */
export async function removeKeyBundles(
  database: Kysely<DB>,
  chatId: string,
): Promise<void> {
  await database
    .deleteFrom("actor_keys",)
    .where("name", "=", `e2e-bundle:${chatId}`,)
    .execute();
}

/**
 * List all users with active key bundles for a chat.
 */
export async function listBundleUsers(
  database: Kysely<DB>,
  chatId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("actor_keys",)
    .select("actor_id",)
    .where("name", "=", `e2e-bundle:${chatId}`,)
    .where("status", "=", "active",)
    .execute();

  return rows.map((r,) => r.actor_id);
}
