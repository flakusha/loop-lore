/**
 * BYO Key Crypto — Server-side AES-256-GCM encrypt/decrypt
 *
 * Used for BYO API key encryption at rest.
 * Key derived via PBKDF2 from config secret.
 */
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit nonce for GCM

/**
 * Derive an AES-256-GCM CryptoKey from a string secret.
 * Uses PBKDF2 with salt "loop-lore-byok-v1" (100k iterations, SHA-256).
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("loop-lore-byok-v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a plaintext string.
 * Returns base64-encoded "iv:ciphertext".
 */
export async function encryptValue(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  const ivBase64 = iv.toBase64();
  const ciphertextBase64 = new Uint8Array(ciphertext).toBase64();
  return `${ivBase64}:${ciphertextBase64}`;
}

/**
 * Decrypt a base64-encoded "iv:ciphertext" string.
 */
export async function decryptValue(encrypted: string, secret: string): Promise<string> {
  const colonIdx = encrypted.indexOf(":");
  if (colonIdx === -1) throw new Error("Invalid encrypted value format");
  const iv = Uint8Array.fromBase64(encrypted.slice(0, colonIdx));
  const data = Uint8Array.fromBase64(encrypted.slice(colonIdx + 1));
  const key = await deriveKey(secret);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data);
  return new TextDecoder().decode(plaintext);
}
