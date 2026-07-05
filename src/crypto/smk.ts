/**
 * SMK (Server Master Key) Loading
 *
 * Derives a 256-bit AES-GCM CryptoKey from SERVER_ENCRYPTION_KEY env var.
 * Loaded once at startup, accessible via getSmk() throughout the app.
 *
 * In dev mode (no SMK + required=false), returns null — encryption skipped.
 * In prod mode (no SMK + required=true), throws — startup failure.
 */

import type { EncryptionConfig } from "../config/schema";

const SMK_SALT = "loop-lore-smk-v1";
const SMK_INFO = "loop-lore-smk-derive";

// Module-level SMK holder — set once at startup
let activeSmk: CryptoKey | null = null;

/**
 * Load the SMK at startup and store it globally.
 * Call once from server entry point.
 */
export async function initSmk(config: EncryptionConfig): Promise<void> {
  activeSmk = await loadSmk(config);
}

/**
 * Get the loaded SMK. Returns null if encryption is disabled (dev mode).
 */
export function getSmk(): CryptoKey | null {
  return activeSmk;
}

/**
 * Check whether message encryption is active.
 */
export function isEncryptionEnabled(): boolean {
  return activeSmk !== null;
}

/**
 * Load and derive the Server Master Key.
 *
 * @returns A CryptoKey (AES-256-GCM) or null if encryption disabled.
 * @throws If SMK is required but not configured.
 */
async function loadSmk(config: EncryptionConfig): Promise<CryptoKey | null> {
  const rawHex = config.serverEncryptionKey?.trim();

  if (!rawHex) {
    if (config.required) {
      throw new Error(
        "SERVER_ENCRYPTION_KEY is required but not set. " +
          "Set ENCRYPTION_REQUIRED=false for dev mode (encryption disabled).",
      );
    }
    return null; // Dev mode — no encryption
  }

  // Accept hex (64 chars = 32 bytes = 256 bits) or raw key material
  const rawBytes = hexToBytes(rawHex);
  if (rawBytes.length !== 32) {
    throw new Error(
      `SERVER_ENCRYPTION_KEY must be 64 hex chars (32 bytes, 256 bits). Got ${rawBytes.length} bytes.`,
    );
  }

  // Derive AES-256-GCM key via HKDF for clean key separation
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    rawBytes as unknown as Uint8Array<ArrayBuffer>,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(SMK_SALT),
      info: new TextEncoder().encode(SMK_INFO),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replaceAll("-", "").replaceAll(/\s/g, "");
  if (cleaned.length % 2 !== 0) throw new Error("Hex string must have even length");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    const val = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(val))
      throw new Error(
        `Invalid hex byte at position ${index * 2}: "${cleaned.slice(index * 2, index * 2 + 2)}"`,
      );
    bytes[index] = val;
  }
  return bytes;
}
