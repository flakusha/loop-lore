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
 *
 * Strict shape validation: the caller must be a well-formed EncryptedPayload
 * JSON object whose `enc`/`nonce` fields are base64-decodable and whose
 * `nonce` decodes to the AES-GCM IV length (12 bytes). Without these
 * checks any user could submit a literal JSON string of the right shape
 * (e.g. `{ "enc":"x", "nonce":"y", "algo":"aes-256-gcm", "key_id":"abc" }`)
 * and have the server treat it as client-pre-encrypted content — storing
 * the forgery verbatim with an attacker-chosen `key_id` and skipping
 * server-side encryption. See BUG-encrypted-payload-sniffing.
 *
 * `key_id` existence in `chat_keys` is NOT verified here (that requires a
 * DB round-trip); the read path will surface the failure as a decryption
 * error. The strict shape catches the common forgery attempt: junk string
 * values that don't decode to valid base64 or that have a wrong-length
 * nonce.
 *
 * For DB-validating checks see `verifyEncryptedPayload` in at-rest.ts.
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
  if (
    typeof p.enc !== "string" ||
    typeof p.nonce !== "string" ||
    p.algo !== "aes-256-gcm" ||
    typeof p.key_id !== "string"
  ) { return false; }
  // Validate nonce: AES-GCM requires exactly 12 bytes. Forged payloads
  // (e.g. `{ "nonce":"y" }`) must NOT pass.
  let nonceBytes: Uint8Array;
  try {
    nonceBytes = Uint8Array.fromBase64(p.nonce,);
  } catch {
    return false;
  }
  if (nonceBytes.length !== IV_LENGTH) { return false; }
  // Ciphertext must also be base64-decodable (it can be any non-empty
  // length; we only require the encoding is valid). Forged placeholders
  // like `"x"` decode but produce a single byte — that's allowed by AES
  // itself; the read path's decryption failure catches the rest.
  try {
    Uint8Array.fromBase64(p.enc,);
  } catch {
    return false;
  }
  return true;
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

  // Reject unknown algorithm identifiers. The write side always emits
  // "aes-256-gcm"; accepting any other value would allow a downgrade attack
  // where a client re-labels the algo field to route decryption through a
  // weaker (or future-removed) path. Only the single supported algorithm
  // passes.
  if (payload.algo !== "aes-256-gcm") {
    throw new Error(`Unsupported encryption algorithm: ${String(payload.algo,)}`,);
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
