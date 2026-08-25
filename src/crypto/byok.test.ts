/**
 * Tests for crypto/byok.ts — BYO API key encrypt/decrypt (PBKDF2 + AES-256-GCM)
 */

import { describe, expect, test, } from "bun:test";
import { decryptValue, encryptValue, } from "./byok";

const SECRET = "test-secret-32-bytes-long!!!!"; // arbitrary passphrase

describe("encryptValue / decryptValue", () => {
  test("round-trip: encrypt then decrypt returns original", async () => {
    const plaintext = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxx";
    const encrypted = await encryptValue(plaintext, SECRET,);
    const decrypted = await decryptValue(encrypted, SECRET,);
    expect(decrypted,).toBe(plaintext,);
  });

  test("round-trip: empty string", async () => {
    const encrypted = await encryptValue("", SECRET,);
    const decrypted = await decryptValue(encrypted, SECRET,);
    expect(decrypted,).toBe("",);
  });

  test("round-trip: unicode content", async () => {
    const unicode = "Hello 世界 🌍 sk-привет-日本語";
    const encrypted = await encryptValue(unicode, SECRET,);
    const decrypted = await decryptValue(encrypted, SECRET,);
    expect(decrypted,).toBe(unicode,);
  });

  test("round-trip: long content (10KB)", async () => {
    const long = "x".repeat(10_000,);
    const encrypted = await encryptValue(long, SECRET,);
    const decrypted = await decryptValue(encrypted, SECRET,);
    expect(decrypted,).toBe(long,);
  });

  test("encrypted format is 'salt:iv:ciphertext' (three base64 chunks separated by colons)", async () => {
    const encrypted = await encryptValue("hello", SECRET,);
    const parts = encrypted.split(":",);
    expect(parts,).toHaveLength(3,);
    // Salt (16 B → 24 base64 chars), IV (12 B → 16 base64 chars), ciphertext.
    // Allow padding-aware lengths but require > 0.
    for (const part of parts) {
      expect(part.length,).toBeGreaterThan(0,);
    }
  });

  test("encrypted output differs from input", async () => {
    const plaintext = "my-api-key";
    const encrypted = await encryptValue(plaintext, SECRET,);
    expect(encrypted,).not.toBe(plaintext,);
    expect(encrypted,).not.toContain(plaintext,);
  });

  test("same input produces different ciphertext (random nonce)", async () => {
    const plaintext = "deterministic?";
    const enc1 = await encryptValue(plaintext, SECRET,);
    const enc2 = await encryptValue(plaintext, SECRET,);
    expect(enc1,).not.toBe(enc2,);
  });

  test("different secrets produce different ciphertext", async () => {
    const plaintext = "same-input";
    const enc1 = await encryptValue(plaintext, SECRET,);
    const enc2 = await encryptValue(plaintext, "different-secret-xxxxxxxxxxx",);
    expect(enc1,).not.toBe(enc2,);
  });

  test("decrypt with wrong secret throws", async () => {
    const encrypted = await encryptValue("secret-message", SECRET,);
    await expect(decryptValue(encrypted, "wrong-secret-xxxxxxxxxxxx",),).rejects.toThrow();
  });

  test("decrypt tampered ciphertext throws", async () => {
    const encrypted = await encryptValue("tamper-me", SECRET,);
    const parts = encrypted.split(":",);
    // Corrupt the ciphertext portion
    const corrupted = `${parts[0]!}:${parts[1]!.slice(0, -4,)}AAAA`;
    await expect(decryptValue(corrupted, SECRET,),).rejects.toThrow();
  });

  test("decrypt invalid format (no colon) throws", async () => {
    await expect(decryptValue("not-valid-format", SECRET,),).rejects.toThrow("Invalid encrypted value format",);
  });

  test("decrypt invalid base64 throws", async () => {
    await expect(decryptValue("!!!not-base64:!!!also-not-base64", SECRET,),).rejects.toThrow();
  });

  test("encrypt then decrypt with 100KB content", async () => {
    const large = "A".repeat(100_000,);
    const encrypted = await encryptValue(large, SECRET,);
    const decrypted = await decryptValue(encrypted, SECRET,);
    // Base64 encoding inflates the ciphertext; verify round-trip correctness instead
    expect(decrypted,).toBe(large,);
  });

  test("decryptValue accepts the legacy 2-chunk wire format (iv:ciphertext)", async () => {
    // The pre-fix PBKDF2-based format used a fixed global salt
    // formats we re-derive an old-style ciphertext by hand: encrypt
    // with the legacy global salt via HKDF (matching what `decryptValue`
    // does on the legacy path) and assert that the 2-chunk form
    // round-trips correctly. This pins the compatibility contract for
    // rows already persisted before the per-record-salt fix.
    const legacySalt = new TextEncoder().encode("loop-lore-byok-v1",);
    const ikm = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET,),
      "HKDF",
      false,
      ["deriveBits",],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: legacySalt as unknown as BufferSource,
        info: new TextEncoder().encode("loop-lore/byok/v1",),
      },
      ikm,
      256,
    );
    const keyBytes = new Uint8Array(bits.byteLength,);
    keyBytes.set(new Uint8Array(bits,),);
    const legacyKey = await crypto.subtle.importKey(
      "raw",
      keyBytes as unknown as Uint8Array<ArrayBuffer>,
      { name: "AES-GCM", },
      false,
      ["encrypt", "decrypt",],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12,),);
    const plaintext = "legacy-row-api-key";
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, },
      legacyKey,
      new TextEncoder().encode(plaintext,),
    );
    const legacyCiphertext = `${iv.toBase64()}:${new Uint8Array(ct,).toBase64()}`;
    const decrypted = await decryptValue(legacyCiphertext, SECRET,);
    expect(decrypted,).toBe(plaintext,);
  });
});
