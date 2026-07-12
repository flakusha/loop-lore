/**
 * Tests for crypto/byok.ts — BYO API key encrypt/decrypt (PBKDF2 + AES-256-GCM)
 */

import { describe, test, expect } from "bun:test";
import { encryptValue, decryptValue } from "./byok";

const SECRET = "test-secret-32-bytes-long!!!!"; // arbitrary passphrase

describe("encryptValue / decryptValue", () => {
  test("round-trip: encrypt then decrypt returns original", async () => {
    const plaintext = "sk-ant-api03-xxxxxxxxxxxxxxxxxxxx";
    const encrypted = await encryptValue(plaintext, SECRET);
    const decrypted = await decryptValue(encrypted, SECRET);
    expect(decrypted).toBe(plaintext);
  });

  test("round-trip: empty string", async () => {
    const encrypted = await encryptValue("", SECRET);
    const decrypted = await decryptValue(encrypted, SECRET);
    expect(decrypted).toBe("");
  });

  test("round-trip: unicode content", async () => {
    const unicode = "Hello 世界 🌍 sk-привет-日本語";
    const encrypted = await encryptValue(unicode, SECRET);
    const decrypted = await decryptValue(encrypted, SECRET);
    expect(decrypted).toBe(unicode);
  });

  test("round-trip: long content (10KB)", async () => {
    const long = "x".repeat(10_000);
    const encrypted = await encryptValue(long, SECRET);
    const decrypted = await decryptValue(encrypted, SECRET);
    expect(decrypted).toBe(long);
  });

  test("encrypted format is 'iv:ciphertext' (two base64 chunks separated by colon)", async () => {
    const encrypted = await encryptValue("hello", SECRET);
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(2);
    // Both parts should be base64
    for (const part of parts) {
      expect(() => Uint8Array.fromBase64(part)).not.toThrow();
    }
  });

  test("encrypted output differs from input", async () => {
    const plaintext = "my-api-key";
    const encrypted = await encryptValue(plaintext, SECRET);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).not.toContain(plaintext);
  });

  test("same input produces different ciphertext (random nonce)", async () => {
    const plaintext = "deterministic?";
    const enc1 = await encryptValue(plaintext, SECRET);
    const enc2 = await encryptValue(plaintext, SECRET);
    expect(enc1).not.toBe(enc2);
  });

  test("different secrets produce different ciphertext", async () => {
    const plaintext = "same-input";
    const enc1 = await encryptValue(plaintext, SECRET);
    const enc2 = await encryptValue(plaintext, "different-secret-xxxxxxxxxxx");
    expect(enc1).not.toBe(enc2);
  });

  test("decrypt with wrong secret throws", async () => {
    const encrypted = await encryptValue("secret-message", SECRET);
    await expect(decryptValue(encrypted, "wrong-secret-xxxxxxxxxxxx")).rejects.toThrow();
  });

  test("decrypt tampered ciphertext throws", async () => {
    const encrypted = await encryptValue("tamper-me", SECRET);
    const parts = encrypted.split(":");
    // Corrupt the ciphertext portion
    const corrupted = `${parts[0]!}:${parts[1]!.slice(0, -4)}AAAA`;
    await expect(decryptValue(corrupted, SECRET)).rejects.toThrow();
  });

  test("decrypt invalid format (no colon) throws", async () => {
    await expect(decryptValue("not-valid-format", SECRET)).rejects.toThrow("Invalid encrypted value format");
  });

  test("decrypt invalid base64 throws", async () => {
    await expect(decryptValue("!!!not-base64:!!!also-not-base64", SECRET)).rejects.toThrow();
  });

  test("encrypt then decrypt with 100KB content", async () => {
    const large = "A".repeat(100_000);
    const encrypted = await encryptValue(large, SECRET);
    // Base64 encoding inflates the ciphertext; verify round-trip correctness instead
    const decrypted = await decryptValue(encrypted, SECRET);
    expect(decrypted).toBe(large);
  });
});
