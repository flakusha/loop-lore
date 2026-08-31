// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

/** */
export interface EncryptedPayload {
  enc: string; // base64 ciphertext
  nonce: string; // base64 12-byte nonce
  algo: "aes-256-gcm";
  comp: boolean; // was compression applied before encrypt?
  compAlgo?: string; // which algorithm: gzip / brotli / zstd
  key_id: string; // FK → actor_keys.id
  a_id?: string; // asset id salt for HKDF-derived subkey (v2 only; absent = v1 legacy)
}

/** */
export interface PipelineConfig {
  threshold: number;
  algorithm: "gzip" | "brotli" | "zstd";
}

/** */
export interface CompressThenEncryptOpts {
  plaintext: string;
  chatKey: CryptoKey;
  keyId: string;
  config?: PipelineConfig;
  aId?: string; // asset id salt — emits v2 payload; absence = v1 legacy
}

/**
 * Write: plaintext → compress → encrypt → EncryptedPayload JSON.
 */
/**
 * Quick check: is this stored content an encrypted payload?
 * Allows detecting client-pre-encrypted content that should skip server-side re-encryption.
 * @param storedContent
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
 * @param storedContent
 */
export function extractKeyIdFromPayload(storedContent: string,): string | null {
  const parsed = safeJsonParse<EncryptedPayload>(storedContent,);
  if (!parsed.ok) { return null; }
  return parsed.value.key_id ?? null;
}

/**
 * @param root0
 * @param root0.plaintext
 * @param root0.chatKey
 * @param root0.keyId
 * @param root0.config
 * @param root0.aId
 */
export async function compressThenEncrypt({
  plaintext,
  chatKey,
  keyId,
  config = DEFAULT_PIPELINE_CONFIG,
  aId,
}: CompressThenEncryptOpts,): Promise<string> {
  let compressed = "";
  let compAlgo: string | undefined;
  let didCompress = false;

  if (plaintext.length >= config.threshold) {
    const attempts: ContentEncoding[] = [config.algorithm, "gzip", "brotli", "zstd",];
    // Deduplicate (in case config.algorithm equals one of the fallbacks)
    const seen = new Set<string>();
    const uniqueAttempts: ContentEncoding[] = [];
    for (const a of attempts) {
      if (seen.has(a,)) { continue; }
      seen.add(a,);
      uniqueAttempts.push(a,);
    }

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

  const payload: EncryptedPayload = {
    enc: new Uint8Array(ciphertext,).toBase64(),
    nonce: nonce.toBase64(),
    algo: "aes-256-gcm",
    comp: didCompress,
    compAlgo: didCompress ? compAlgo : undefined,
    key_id: keyId,
    ...(aId !== undefined && { a_id: aId, }),
  };
  const r = safeJsonStringify(payload,);
  if (!r.ok) { throw new Error("Failed to serialize encrypted payload",); }
  return r.value;
}

/**
 * Read: EncryptedPayload JSON → decrypt → decompress → plaintext.
 * @param storedContent
 * @param chatKey
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

    throw new Error(`Decryption failed: ${(error as Error).message}. Possible tampered data or wrong key.`, {
      cause: error,
    },);
  }

  const decryptedText = new TextDecoder().decode(decryptedBytes,);

  // 4. Decompress if needed
  if (!payload.comp) {
    return decryptedText;
  }

  // `payload.comp === true` requires `payload.compAlgo` to be set. The write
  // side (compressThenEncrypt) always emits compAlgo when comp is true, so a
  // missing compAlgo indicates either legacy data written before the fix or
  // client-side tampering. Either way, silently guessing an algorithm (the
  // previous behavior) returned base64 ciphertext to the user as plaintext —
  // see BUG-safedecompress-pre-check. Fail loudly so the caller can surface
  // a clear error.
  if (!payload.compAlgo) {
    throw new Error("Malformed encrypted payload: comp=true but compAlgo is missing",);
  }
  return decodeContent(decryptedText, payload.compAlgo as ContentEncoding,);
}
