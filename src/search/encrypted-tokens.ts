// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Deterministic ciphertext-token search for client-pre-encrypted rows.
 *
 * Rows whose `content_plaintext IS NULL` are invisible to FTS5. At encrypt
 * time the client (or server, once it holds the secret) derives
 * HMAC-SHA256(userKey, token) blind tokens per word and stores them in
 * `message_search_tokens`. The server matches query tokens without ever
 * seeing plaintext.
 *
 * Privacy tradeoff (accepted 2026-09-07): tokens reveal that "two messages
 * share a token" but not the token value; per-user keys prevent cross-user
 * leakage.
 *
 * PREREQUISITE (not yet landed): `users.encryption_secret` column + the
 * `message_search_tokens` table (`parts/NNN_search_tokens.ts`). Until the
 * migration lands, callers pass an out-of-band key; the derivation itself
 * is stable so stored tokens survive the migration unchanged.
 *
 * Isomorphic (WebCrypto only, no Buffer) — mirrors `src/utils/hkdf.ts`.
 */

/** Minimum word length indexed as a token. */
export const MIN_TOKEN_LENGTH = 3;

/** Hex chars kept per HMAC token (128 → 64 bits; collision-negligible per user). */
export const TOKEN_HEX_LENGTH = 16;

/**
 * Split plaintext into indexable tokens: lowercase, alphanumeric, deduped.
 * Exported so the backfill migration reuses the exact same tokenizer.
 * @param plaintext - message content (decrypted)
 * @returns unique tokens in first-seen order
 * @example
 * ```ts
 * tokenizeForSearch("Hello, hello tavern!"); // → ["hello", "tavern"]
 * ```
 */
export function tokenizeForSearch(plaintext: string,): string[] {
  const seen = new Set<string>();
  for (const raw of plaintext.toLowerCase().split(/[^a-z0-9]+/,)) {
    if (raw.length >= MIN_TOKEN_LENGTH && !seen.has(raw,)) { seen.add(raw,); }
  }
  return Array.from(seen,);
}

async function importHmacKey(userKey: string | Uint8Array,): Promise<CryptoKey> {
  const raw = typeof userKey === "string" ? new TextEncoder().encode(userKey,) : userKey;
  if (raw.length === 0) { throw new Error("deriveSearchTokens: userKey must be non-empty",); }
  // Fresh copy: narrows Uint8Array<ArrayBufferLike> to ArrayBuffer-backed,
  // which is what `BufferSource` requires.
  const bytes = new Uint8Array(raw,);
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256", }, false, ["sign",],);
}

/**
 * Derive blind search tokens for one message.
 * Deterministic: same (plaintext, userKey) → same tokens.
 * @param plaintext - message content (decrypted)
 * @param userKey - per-user HMAC key (`users.encryption_secret` once migrated)
 * @returns hex token strings, one per unique word
 * @throws Error when userKey is empty
 * @example
 * ```ts
 * await deriveSearchTokens("tavern song", key); // → ["a3f9…", "71c0…"]
 * ```
 */
export async function deriveSearchTokens(
  plaintext: string,
  userKey: string | Uint8Array,
): Promise<string[]> {
  const words = tokenizeForSearch(plaintext,);
  if (words.length === 0) { return []; }
  const key = await importHmacKey(userKey,);
  const out: string[] = [];
  for (const word of words) {
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(word,),);
    const digest = new Uint8Array(sig,);
    let hex = "";
    for (const b of digest) { hex += b.toString(16,).padStart(2, "0",); }
    out.push(hex.slice(0, TOKEN_HEX_LENGTH,),);
  }
  return out;
}
