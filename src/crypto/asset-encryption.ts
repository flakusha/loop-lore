/**
 * Asset Encryption — Encrypt/Decrypt Asset Blobs
 *
 * Uses the same compress-then-encrypt pipeline as messages.
 * Assets inherit encryption tier from parent entity.
 */
import { safeJsonParse, } from "../utils";
import type { ChatKey, } from "./chat-keys";
import { compressThenEncrypt, decryptThenDecompress, type PipelineConfig, } from "./pipeline";

export interface AssetEncryptionResult {
  encrypted: boolean;
  keyId: string | null;
  data: Buffer;
}

/**
 * Encrypt an asset blob if encryption is enabled and tier is not public.
 *
 * @param buffer - Raw asset bytes
 * @param chatKey - Derived chat key for encryption
 * @param keyId - Key ID to embed in payload
 * @param config - Pipeline config (threshold, algorithm)
 * @param tier - Encryption tier (public = no encryption)
 * @returns Encrypted buffer or original buffer if public tier
 */
export async function encryptAssetBlob(
  buffer: Buffer,
  chatKey: ChatKey | null,
  keyId: string | null,
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

  // Encrypt the blob using the raw CryptoKey from ChatKey
  const plaintext = buffer.toString("base64",);
  const encryptedJson = await compressThenEncrypt({
    plaintext,
    chatKey: chatKey.key,
    keyId,
    config,
  },);

  return {
    encrypted: true,
    keyId,
    data: Buffer.from(encryptedJson, "utf8",),
  };
}

/**
 * Decrypt an asset blob.
 *
 * @param buffer - Encrypted asset bytes (JSON payload)
 * @param chatKey - Derived chat key for decryption
 * @returns Decrypted buffer
 * @throws If decryption fails (tampered/invalid key)
 */
export async function decryptAssetBlob(
  buffer: Buffer,
  chatKey: ChatKey,
): Promise<Buffer> {
  const encryptedJson = buffer.toString("utf8",);
  const base64 = await decryptThenDecompress(encryptedJson, chatKey.key,);
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
