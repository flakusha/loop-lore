/**
 * Compress-Then-Encrypt Pipeline
 *
 * Write:  plaintext → compress → encrypt → EncryptedPayload
 * Read:   EncryptedPayload → decrypt → decompress → plaintext
 *
 * Matches spec at docs/frontend/encryption.md §Compress-Encrypt Pipeline
 */

import { encodeContent, decodeContent } from "../content";
import type { ContentEncoding } from "../content/types";

const IV_LENGTH = 12;
const DEFAULT_THRESHOLD = 128;

export interface EncryptedPayload {
  enc: string; // base64 ciphertext
  nonce: string; // base64 12-byte nonce
  algo: "aes-256-gcm";
  comp: boolean; // was compression applied before encrypt?
  compAlgo?: string; // which algorithm: gzip / brotli / zstd
  key_id: string; // FK → actor_keys.id
}

export interface PipelineConfig {
  threshold: number;
  algorithm: "gzip" | "brotli" | "zstd";
}

/**
 * Write: plaintext → compress → encrypt → EncryptedPayload JSON.
 */
export async function compressThenEncrypt(
  plaintext: string,
  chatKey: CryptoKey,
  keyId: string,
  config: PipelineConfig = { threshold: DEFAULT_THRESHOLD, algorithm: "gzip" },
): Promise<string> {
  // 1. Compress if large enough
  let compressed: string;
  let compAlgo: string | undefined;
  let didCompress = false;

  if (plaintext.length >= config.threshold) {
    const attempts: ContentEncoding[] = [config.algorithm, "gzip", "brotli", "zstd"];
    // Deduplicate (in case config.algorithm equals one of the fallbacks)
    const seen = new Set<string>();
    const uniqueAttempts = attempts.filter((a) => {
      if (seen.has(a)) return false;
      seen.add(a);
      return true;
    });

    for (const algo of uniqueAttempts) {
      try {
        const result = encodeContent(plaintext, algo);
        if (result.encoding !== "identity" && result.encoded.length < plaintext.length) {
          compressed = result.encoded;
          compAlgo = algo;
          didCompress = true;
          break;
        }
      } catch {
        // Best-effort: if one algorithm fails, try the next. If all fail,
        // fall back to plaintext (no compression). This is intentional —
        // compression is an optimization, not a requirement.
        continue;
      }
    }
  }

  // Avoid non-null assertion — branch on didCompress explicitly
  let dataToEncrypt: string;
  if (didCompress) {
    // Both compressed + didCompress set in same loop branch; TS can't prove it
    dataToEncrypt = compressed;
  } else {
    dataToEncrypt = plaintext;
  }
  const dataBytes = new TextEncoder().encode(dataToEncrypt);

  // 2. Encrypt
  const nonce = new Uint8Array(crypto.getRandomValues(new Uint8Array(IV_LENGTH)));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chatKey, dataBytes);

  // 3. Package
  const payload: EncryptedPayload = {
    enc: new Uint8Array(ciphertext).toBase64(),
    nonce: nonce.toBase64(),
    algo: "aes-256-gcm",
    comp: didCompress,
    compAlgo: didCompress ? compAlgo : undefined,
    key_id: keyId,
  };

  return JSON.stringify(payload);
}

/**
 * Read: EncryptedPayload JSON → decrypt → decompress → plaintext.
 *
 * @throws If decryption fails (wrong key, tampered data).
 */
export async function decryptThenDecompress(storedContent: string, chatKey: CryptoKey): Promise<string> {
  // 1. Parse JSON
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(storedContent) as EncryptedPayload;
  } catch {
    throw new Error("Malformed encrypted payload: invalid JSON");
  }

  // Validate shape
  if (!payload.enc || !payload.nonce || !payload.algo) {
    throw new Error("Malformed encrypted payload: missing required fields");
  }

  // 2. Decode from base64 — ensure ArrayBuffer-backed for Web Crypto
  const ciphertext = new Uint8Array(Uint8Array.fromBase64(payload.enc));
  const nonce = new Uint8Array(Uint8Array.fromBase64(payload.nonce));

  // 3. Decrypt
  let decryptedBytes: Uint8Array;
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, chatKey, ciphertext);
    decryptedBytes = new Uint8Array(decrypted);
  } catch (error) {
    // Authentication tag mismatch or wrong key
    throw new Error(`Decryption failed: ${(error as Error).message}. Possible tampered data or wrong key.`);
  }

  const decryptedText = new TextDecoder().decode(decryptedBytes);

  // 4. Decompress if needed
  if (!payload.comp) {
    return decryptedText;
  }

  try {
    // Fall back to "gzip" if compAlgo field is missing (legacy/edge case).
    // If the guess is wrong, decompression fails and outer catch returns raw bytes.
    const compAlgo = (payload.compAlgo ?? "gzip") as ContentEncoding;
    return decodeContent(decryptedText, compAlgo);
  } catch {
    // Decompression failure: return decrypted raw bytes as-is, per spec
    return decryptedText;
  }
}
