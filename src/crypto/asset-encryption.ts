// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Encryption — Encrypt/Decrypt Asset Blobs
 *
 * Each asset gets its own encryption subkey, derived via HKDF from the parent
 * chat key + asset id. This isolates asset ciphertexts from each other:
 *   - Re-encryption on key rotation is automatic (re-derive from new chat key
 *     with the same asset id salt).
 *   - Compromise of one asset's plaintext does not expose other assets'
 *     plaintexts (each subkey is independent).
 *   - Membership change does not break asset history; legacy key rotation
 *     walks assets alongside messages.
 *
 * Backwards compatibility: payloads WITHOUT an `a_id` field are v1 (legacy,
 * encrypted directly with the chat key). v2 payloads include `a_id` and
 * use the per-asset subkey. Decryption auto-detects the version.
 */
import { safeJsonParse, } from "../utils";
import type { ChatKey, } from "./chat-keys";
import {
  compressThenEncrypt,
  decryptThenDecompress,
  type EncryptedPayload,
  extractKeyIdFromPayload,
  type PipelineConfig,
} from "./pipeline";

const ASSET_HKDF_INFO = "loop-lore-asset-subkey-v1";

export interface AssetEncryptionResult {
  encrypted: boolean;
  keyId: string | null;
  data: Buffer;
}

/**
 * Derive a per-asset encryption subkey from the parent chat key.
 *
 * Uses HKDF-SHA-256 with the asset id as salt and a versioned info string.
 * The subkey is deterministic for any (chatKey, assetId) pair, so re-encrypt
 * during key rotation produces an equivalent key from the new chat key.
 */
export async function deriveAssetSubkey(chatKey: ChatKey, assetId: string,): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    chatKey.rawKey as unknown as Parameters<typeof crypto.subtle.importKey>[1],
    "HKDF",
    false,
    ["deriveKey",],
  );
  const salt = new TextEncoder().encode(assetId,);
  const info = new TextEncoder().encode(ASSET_HKDF_INFO,);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info, },
    ikm,
    { name: "AES-GCM", length: 256, },
    true,
    ["encrypt", "decrypt",],
  );
}

/**
 * Encrypt an asset blob if encryption is enabled and tier is not public.
 *
 * @param buffer - Raw asset bytes
 * @param chatKey - Derived chat key for the parent entity
 * @param keyId - Chat key ID to embed in payload (`key_id`)
 * @param assetId - Asset ID used as HKDF salt to derive the per-asset subkey
 * @param config - Pipeline config (threshold, algorithm)
 * @param tier - Encryption tier (public = no encryption)
 * @returns Encrypted buffer (v2 payload with `a_id`) or original buffer if public tier
 */
export async function encryptAssetBlob(
  buffer: Buffer,
  chatKey: ChatKey | null,
  keyId: string | null,
  assetId: string,
  config: PipelineConfig,
  tier: string,
): Promise<AssetEncryptionResult> {
  // Public tier — no encryption
  if (tier === "public" || !chatKey || !keyId) {
    return {
      encrypted: false,
      keyId: null,
      data: buffer,
    };
  }

  // Derive per-asset subkey and encrypt with it (v2 payload includes a_id)
  const subkey = await deriveAssetSubkey(chatKey, assetId,);
  const plaintext = buffer.toString("base64",);
  const encryptedJson = await compressThenEncrypt({
    plaintext,
    chatKey: subkey,
    keyId,
    config,
    aId: assetId,
  },);

  return {
    encrypted: true,
    keyId,
    data: Buffer.from(encryptedJson, "utf8",),
  };
}

/**
 * Decrypt an asset blob. Auto-detects v1 (direct chat key) vs v2 (subkey)
 * payloads.
 *
 * @param buffer - Encrypted asset bytes (JSON payload)
 * @param chatKey - Derived chat key for the parent entity
 * @param assetId - Asset ID used as HKDF salt for v2 payloads
 * @returns Decrypted buffer
 * @throws If decryption fails (tampered/invalid key)
 */
export async function decryptAssetBlob(
  buffer: Buffer,
  chatKey: ChatKey,
  assetId: string,
): Promise<Buffer> {
  const encryptedJson = buffer.toString("utf8",);
  const parsed = safeJsonParse<EncryptedPayload>(encryptedJson,);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    throw new Error("Asset blob is not a valid encrypted payload",);
  }
  const payloadAId = parsed.value.a_id;
  const isV2 = typeof payloadAId === "string" && payloadAId.length > 0;
  const subkeySource = isV2 && payloadAId ? payloadAId : assetId;
  const key = isV2 ? await deriveAssetSubkey(chatKey, subkeySource,) : chatKey.key;
  const base64 = await decryptThenDecompress(encryptedJson, key,);
  return Buffer.from(base64, "base64",);
}

/**
 * Check if an asset blob is encrypted (has valid JSON structure).
 */
export function isEncryptedAsset(buffer: Buffer,): boolean {
  try {
    const str = buffer.toString("utf8",).trim();
    if (!str.startsWith("{",)) { return false; }
    const parsed = safeJsonParse(str,);
    if (!parsed.ok) { return false; }
    return typeof parsed.value === "object" && parsed.value !== null && "enc" in parsed.value &&
      "nonce" in parsed.value;
  } catch {
    return false;
  }
}

/**
 * Extract the chat key id from an encrypted asset payload.
 *
 * Returns `null` for malformed payloads or plaintext.
 */
export function extractAssetKeyId(buffer: Buffer,): string | null {
  return extractKeyIdFromPayload(buffer.toString("utf8",),);
}
