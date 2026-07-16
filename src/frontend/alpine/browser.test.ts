/**
 * Tests for frontend/browser.ts — browser compression and encryption utilities
 */

import { describe, test, expect, beforeAll } from "bun:test";
import {
  browserEncodeContent,
  browserDecodeContent,
  browserEncryptContent,
  browserDecryptContent,
  browserImportKey,
  browserExportKey,
  browserGenerateKey,
  browserCompressThenEncrypt,
  browserDecryptThenDecompress,
  type BrowserEncodeResult,
  type BrowserEncryptResult,
  type BrowserEncryptedPayload,
} from "../browser";

const SHORT_TEXT = "Hello, World!";
const LARGE_TEXT = "The quick brown fox jumps over the lazy dog. ".repeat(200); // ~8.8KB
const UNICODE_TEXT = "Hello 世界 🌍 Привет 日本語 🚀 Zażółć gęślą jaźń";

let cryptoKey: CryptoKey;

beforeAll(async () => {
  cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
});

describe("browserEncodeContent / browserDecodeContent", () => {
  test("returns identity for short text", async () => {
    const result = await browserEncodeContent(SHORT_TEXT, "gzip");
    expect(result.encoded).toBe(SHORT_TEXT);
    expect(result.encoding).toBe("identity");
  });

  test("returns identity for empty string", async () => {
    const result = await browserEncodeContent("", "gzip");
    expect(result.encoded).toBe("");
    expect(result.encoding).toBe("identity");
  });

  test("compresses large text with gzip", async () => {
    const result = await browserEncodeContent(LARGE_TEXT, "gzip");
    expect(result.encoding).toBe("gzip");
    expect(result.encoded.length).toBeLessThan(LARGE_TEXT.length);
  });

  test("compresses large text with brotli", async () => {
    const result = await browserEncodeContent(LARGE_TEXT, "brotli");
    expect(["brotli", "gzip", "identity"]).toContain(result.encoding);
  });

  test("compresses large text with zstd (fallback to gzip)", async () => {
    const result = await browserEncodeContent(LARGE_TEXT, "zstd");
    // zstd not available in browser, falls back to gzip or brotli
    expect(["gzip", "brotli", "identity"]).toContain(result.encoding);
  });

  test("round-trips short text", async () => {
    const encoded = await browserEncodeContent(SHORT_TEXT, "gzip");
    const decoded = await browserDecodeContent(encoded.encoded, encoded.encoding);
    expect(decoded).toBe(SHORT_TEXT);
  });

  test("round-trips large text", async () => {
    const encoded = await browserEncodeContent(LARGE_TEXT, "gzip");
    const decoded = await browserDecodeContent(encoded.encoded, encoded.encoding);
    expect(decoded).toBe(LARGE_TEXT);
  });

  test("round-trips unicode text", async () => {
    const encoded = await browserEncodeContent(UNICODE_TEXT, "gzip");
    const decoded = await browserDecodeContent(encoded.encoded, encoded.encoding);
    expect(decoded).toBe(UNICODE_TEXT);
  });
});

describe("browserEncryptContent / browserDecryptContent", () => {
  test("encrypts and decrypts short text", async () => {
    const encrypted = await browserEncryptContent(SHORT_TEXT, cryptoKey);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.nonce).toBeDefined();
    expect(encrypted.algorithm).toBe("aes-256-gcm");

    const decrypted = await browserDecryptContent(encrypted.ciphertext, encrypted.nonce, cryptoKey);
    expect(decrypted).toBe(SHORT_TEXT);
  });

  test("encrypts and decrypts unicode text", async () => {
    const encrypted = await browserEncryptContent(UNICODE_TEXT, cryptoKey);
    const decrypted = await browserDecryptContent(encrypted.ciphertext, encrypted.nonce, cryptoKey);
    expect(decrypted).toBe(UNICODE_TEXT);
  });

  test("produces different ciphertext for same plaintext (random nonce)", async () => {
    const enc1 = await browserEncryptContent(SHORT_TEXT, cryptoKey);
    const enc2 = await browserEncryptContent(SHORT_TEXT, cryptoKey);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.nonce).not.toBe(enc2.nonce);
  });

  test("throws on empty plaintext", async () => {
    await expect(browserEncryptContent("", cryptoKey)).rejects.toThrow("Cannot encrypt empty content");
  });

  test("throws on missing ciphertext", async () => {
    await expect(browserDecryptContent("", "nonce", cryptoKey)).rejects.toThrow(
      "Missing ciphertext or nonce",
    );
  });

  test("throws on missing nonce", async () => {
    await expect(browserDecryptContent("ciphertext", "", cryptoKey)).rejects.toThrow(
      "Missing ciphertext or nonce",
    );
  });

  test("fails with wrong key", async () => {
    const wrongKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const encrypted = await browserEncryptContent(SHORT_TEXT, cryptoKey);
    await expect(browserDecryptContent(encrypted.ciphertext, encrypted.nonce, wrongKey)).rejects.toThrow();
  });
});

describe("browserImportKey / browserExportKey", () => {
  test("exports and imports key correctly", async () => {
    const exported = await browserExportKey(cryptoKey);
    expect(typeof exported).toBe("string");
    expect(exported.length).toBeGreaterThan(0);

    const imported = await browserImportKey(exported);
    expect(imported).toBeInstanceOf(CryptoKey);

    // Verify imported key works
    const encrypted = await browserEncryptContent(SHORT_TEXT, imported);
    const decrypted = await browserDecryptContent(encrypted.ciphertext, encrypted.nonce, imported);
    expect(decrypted).toBe(SHORT_TEXT);
  });
});

describe("browserGenerateKey", () => {
  test("generates a valid CryptoKey", async () => {
    const key = await browserGenerateKey();
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.type).toBe("secret");
    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
  });
});

describe("browserCompressThenEncrypt / browserDecryptThenDecompress", () => {
  test("compress-then-encrypt short text (no compression)", async () => {
    const payload = await browserCompressThenEncrypt(SHORT_TEXT, cryptoKey, "key-1");
    const parsed = JSON.parse(payload) as BrowserEncryptedPayload;

    expect(parsed.comp).toBe(false);
    expect(parsed.key_id).toBe("key-1");
    expect(parsed.algo).toBe("aes-256-gcm");
    expect(parsed.enc).toBeDefined();
    expect(parsed.nonce).toBeDefined();

    const decrypted = await browserDecryptThenDecompress(payload, cryptoKey);
    expect(decrypted).toBe(SHORT_TEXT);
  });

  test("compress-then-encrypt large text (with compression)", async () => {
    const payload = await browserCompressThenEncrypt(LARGE_TEXT, cryptoKey, "key-1");
    const parsed = JSON.parse(payload) as BrowserEncryptedPayload;

    expect(parsed.comp).toBe(true);
    expect(parsed.compAlgo).toBeDefined();
    if (parsed.compAlgo) {
      expect(["gzip", "brotli", "zstd"]).toContain(parsed.compAlgo);
    }

    const decrypted = await browserDecryptThenDecompress(payload, cryptoKey);
    expect(decrypted).toBe(LARGE_TEXT);
  });

  test("round-trips unicode text", async () => {
    const payload = await browserCompressThenEncrypt(UNICODE_TEXT, cryptoKey, "key-1");
    const decrypted = await browserDecryptThenDecompress(payload, cryptoKey);
    expect(decrypted).toBe(UNICODE_TEXT);
  });

  test("round-trips empty string", async () => {
    // Note: browserEncryptContent throws on empty string, so this tests the edge case
    await expect(browserCompressThenEncrypt("", cryptoKey, "key-1")).rejects.toThrow(
      "Cannot encrypt empty content",
    );
  });

  test("fails with wrong key", async () => {
    const wrongKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const payload = await browserCompressThenEncrypt(SHORT_TEXT, cryptoKey, "key-1");
    await expect(browserDecryptThenDecompress(payload, wrongKey)).rejects.toThrow();
  });

  test("fails with malformed JSON", async () => {
    await expect(browserDecryptThenDecompress("not-json", cryptoKey)).rejects.toThrow(
      "Malformed encrypted payload",
    );
  });

  test("fails with missing required fields", async () => {
    await expect(browserDecryptThenDecompress(JSON.stringify({}), cryptoKey)).rejects.toThrow();
  });

  test("handles corrupted compAlgo gracefully", async () => {
    // Encrypt normally but then corrupt the compression marker
    const text = "x".repeat(200);
    const payload = await browserCompressThenEncrypt(text, cryptoKey, "key-1", 128);
    const parsed = JSON.parse(payload) as BrowserEncryptedPayload;

    // Corrupt: mark as compressed but with wrong algorithm name
    parsed.comp = true;
    parsed.compAlgo = "bogus-algo";

    // Should not throw — returns raw decrypted bytes
    const result = await browserDecryptThenDecompress(JSON.stringify(parsed), cryptoKey);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
