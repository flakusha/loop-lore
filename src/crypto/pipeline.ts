/**
 * Compress-Then-Encrypt Pipeline
 *
 * Write:  plaintext → compress → encrypt → EncryptedPayload
 * Read:   EncryptedPayload → decrypt → decompress → plaintext
 *
 * Matches spec at docs/frontend/encryption.md §Compress-Encrypt Pipeline
 */

import { decodeContent, encodeContent, } from "../content";
import type { ContentEncoding, } from "../content/types";
import { safeJsonParse, safeJsonStringify, } from "../utils";

const IV_LENGTH = 12;
const DEFAULT_THRESHOLD = 128;
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = { threshold: DEFAULT_THRESHOLD, algorithm: "gzip", };

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

export interface CompressThenEncryptOpts {
  plaintext: string;
  chatKey: CryptoKey;
  keyId: string;
  config?: PipelineConfig;
}

/**
 * Write: plaintext → compress → encrypt → EncryptedPayload JSON.
 */
/**
 * Quick check: is this stored content an encrypted payload?
 * Allows detecting client-pre-encrypted content that should skip server-side re-encryption.
 */
export function isEncryptedPayload(storedContent: string,): boolean {
  if (typeof storedContent !== "string") { return false; }
  const trimmed = storedContent.trim();
  if (!trimmed.startsWith("{",)) { return false; }
  if (!trimmed.endsWith("}",)) { return false; }
  const parsed = safeJsonParse<EncryptedPayload>(trimmed,);
  if (!parsed.ok) { return false; }
  const p = parsed.value;
  return (
    typeof p.enc === "string" &&
    typeof p.nonce === "string" &&
    typeof p.algo === "string" &&
    p.algo === "aes-256-gcm" &&
    typeof p.key_id === "string"
  );
}

/**
 * Extract key_id from an encrypted payload without full parsing.
 */
export function extractKeyIdFromPayload(storedContent: string,): string | null {
  const parsed = safeJsonParse<EncryptedPayload>(storedContent,);
  if (!parsed.ok) { return null; }
  return parsed.value.key_id ?? null;
}

export async function compressThenEncrypt({
  plaintext,
  chatKey,
  keyId,
  config = DEFAULT_PIPELINE_CONFIG,
}: CompressThenEncryptOpts,): Promise<string> {
  // 1. Compress if large enough
  let compressed = "";
  let compAlgo: string | undefined;
  let didCompress = false;

  if (plaintext.length >= config.threshold) {
    const attempts: ContentEncoding[] = [config.algorithm, "gzip", "brotli", "zstd",];
    // Deduplicate (in case config.algorithm equals one of the fallbacks)
    const seen = new Set<string>();
    const uniqueAttempts = attempts.filter((a,) => {
      if (seen.has(a,)) { return false; }
      seen.add(a,);
      return true;
    },);

    for (const algo of uniqueAttempts) {
      try {
        const result = encodeContent(plaintext, algo,);
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

  const dataToEncrypt = didCompress ? compressed : plaintext;
  const dataBytes = new TextEncoder().encode(dataToEncrypt,);

  // 2. Encrypt
  const nonce = new Uint8Array(crypto.getRandomValues(new Uint8Array(IV_LENGTH,),),);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, }, chatKey, dataBytes,);

  // 3. Package
  const payload: EncryptedPayload = {
    enc: new Uint8Array(ciphertext,).toBase64(),
    nonce: nonce.toBase64(),
    algo: "aes-256-gcm",
    comp: didCompress,
    compAlgo: didCompress ? compAlgo : undefined,
    key_id: keyId,
  };

  const r = safeJsonStringify(payload,);
  if (!r.ok) { throw new Error("Failed to serialize encrypted payload",); }
  return r.value;
}

/**
 * Read: EncryptedPayload JSON → decrypt → decompress → plaintext.
 *
 * @throws If decryption fails (wrong key, tampered data).
 */
export async function decryptThenDecompress(storedContent: string, chatKey: CryptoKey,): Promise<string> {
  // 1. Parse JSON
  const parsed = safeJsonParse<EncryptedPayload>(storedContent,);
  if (!parsed.ok) { throw new Error("Malformed encrypted payload: invalid JSON",); }
  const payload = parsed.value;

  // Validate shape
  if (!payload.enc || !payload.nonce || !payload.algo) {
    throw new Error("Malformed encrypted payload: missing required fields",);
  }

  // 2. Decode from base64 — ensure ArrayBuffer-backed for Web Crypto
  const ciphertext = new Uint8Array(Uint8Array.fromBase64(payload.enc,),);
  const nonce = new Uint8Array(Uint8Array.fromBase64(payload.nonce,),);

  // 3. Decrypt
  let decryptedBytes: Uint8Array;
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, }, chatKey, ciphertext,);
    decryptedBytes = new Uint8Array(decrypted,);
  } catch (error) {
    // Authentication tag mismatch or wrong key
    throw new Error(`Decryption failed: ${(error as Error).message}. Possible tampered data or wrong key.`,);
  }

  const decryptedText = new TextDecoder().decode(decryptedBytes,);

  // 4. Decompress if needed
  if (!payload.comp) {
    return decryptedText;
  }

  try {
    // Fall back to "gzip" if compAlgo field is missing (legacy/edge case).
    // If the guess is wrong, decompression fails and outer catch returns raw bytes.
    const compAlgo = (payload.compAlgo ?? "gzip") as ContentEncoding;
    return decodeContent(decryptedText, compAlgo,);
  } catch {
    // Decompression failure: return decrypted raw bytes as-is, per spec
    return decryptedText;
  }
}
