/**
 * Tests for crypto/pipeline.ts — compressThenEncrypt / decryptThenDecompress
 */

import { beforeAll, describe, expect, test, } from "bun:test";
import { compressThenEncrypt, decryptThenDecompress, isEncryptedPayload, } from "./pipeline";

// Use a shorter key ID since the pipeline just stores it, doesn't validate length
const KEY_ID = "key-001";
const SHORT_TEXT = "Hello, World!";
const LARGE_TEXT = "The quick brown fox jumps over the lazy dog. ".repeat(200,); // ~8.8KB
const UNICODE_TEXT = "Hello 世界 🌍 Привет 日本語 🚀 Zażółć gęślą jaźń";

let cryptoKey: CryptoKey;

beforeAll(async () => {
  cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, ["encrypt", "decrypt",],);
},);

// ── Round-trip ──────────────────────────────────────────────

describe("round-trip", () => {
  test("short text (below default threshold of 128) — encrypts without compression", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const payload = JSON.parse(encrypted,);
    expect(payload.comp,).toBe(false,);
    expect(payload.key_id,).toBe(KEY_ID,);
    expect(payload.algo,).toBe("aes-256-gcm",);

    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe(SHORT_TEXT,);
  });

  test("large text (above threshold) — compresses then encrypts", async () => {
    const encrypted = await compressThenEncrypt({
      plaintext: LARGE_TEXT,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: {
        threshold: 128,
        algorithm: "gzip",
      },
    },);
    const payload = JSON.parse(encrypted,);
    expect(payload.comp,).toBe(true,);
    expect(payload.compAlgo,).toBe("gzip",);

    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe(LARGE_TEXT,);
  });

  test("large text with brotli algorithm", async () => {
    const encrypted = await compressThenEncrypt({
      plaintext: LARGE_TEXT,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: {
        threshold: 128,
        algorithm: "brotli",
      },
    },);
    const payload = JSON.parse(encrypted,);
    expect(payload.comp,).toBe(true,);
    expect(payload.compAlgo,).toBe("brotli",);

    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe(LARGE_TEXT,);
  });

  test("large text with zstd algorithm", async () => {
    const encrypted = await compressThenEncrypt({
      plaintext: LARGE_TEXT,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: {
        threshold: 128,
        algorithm: "zstd",
      },
    },);
    const payload = JSON.parse(encrypted,);
    expect(payload.comp,).toBe(true,);
    expect(payload.compAlgo,).toBe("zstd",);

    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe(LARGE_TEXT,);
  });

  test("unicode content round-trip", async () => {
    const encrypted = await compressThenEncrypt({
      plaintext: UNICODE_TEXT,
      chatKey: cryptoKey,
      keyId: KEY_ID,
    },);
    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe(UNICODE_TEXT,);
  });

  test("empty string round-trip", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: "", chatKey: cryptoKey, keyId: KEY_ID, },);
    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe("",);
  });
});

// ── Threshold edge cases ────────────────────────────────────

describe("threshold", () => {
  test("content exactly at threshold — may compress if algo saves bytes", async () => {
    const atThreshold = "x".repeat(128,);
    const encrypted = await compressThenEncrypt({
      plaintext: atThreshold,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: {
        threshold: 128,
        algorithm: "gzip",
      },
    },);
    // If compression reduces size, comp=true; otherwise false
    // Either is valid — just verify round-trip
    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe(atThreshold,);
  });

  test("content 1 byte below threshold — not compressed", async () => {
    const belowThreshold = "x".repeat(127,);
    const encrypted = await compressThenEncrypt({
      plaintext: belowThreshold,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: {
        threshold: 128,
        algorithm: "gzip",
      },
    },);
    const payload = JSON.parse(encrypted,);
    expect(payload.comp,).toBe(false,);
  });

  test("custom threshold of 0 compresses everything", async () => {
    // Even a short string compressed, if algo reduces size
    const encrypted = await compressThenEncrypt({
      plaintext: "hello world this is a test",
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: {
        threshold: 0,
        algorithm: "gzip",
      },
    },);
    // With very short text, gzip may not compress — either outcome valid
    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe("hello world this is a test",);
  });

  test("very high threshold (1MB) — never compresses", async () => {
    const encrypted = await compressThenEncrypt({
      plaintext: LARGE_TEXT,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: {
        threshold: 1_000_000,
        algorithm: "gzip",
      },
    },);
    const payload = JSON.parse(encrypted,);
    expect(payload.comp,).toBe(false,);
  });
});

// ── Security / error paths ──────────────────────────────────

describe("error paths", () => {
  test("decrypt with wrong key throws", async () => {
    const wrongKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, [
      "encrypt",
      "decrypt",
    ],);
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    await expect(decryptThenDecompress(encrypted, wrongKey,),).rejects.toThrow("Decryption failed",);
  });

  test("malformed JSON payload throws", async () => {
    await expect(decryptThenDecompress("not-json", cryptoKey,),).rejects.toThrow("Malformed encrypted payload",);
  });

  test("payload missing required fields throws", async () => {
    await expect(decryptThenDecompress(JSON.stringify({},), cryptoKey,),).rejects.toThrow(
      "missing required fields",
    );
  });

  test("payload with missing enc field throws", async () => {
    await expect(
      decryptThenDecompress(JSON.stringify({ nonce: "aaa", algo: "aes-256-gcm", },), cryptoKey,),
    ).rejects.toThrow("missing required fields",);
  });

  test("tampered ciphertext (flip last byte) throws", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo?: string;
      key_id: string;
    };
    // Tamper: flip last base64 char
    const lastChar = payload.enc[payload.enc.length - 1];
    const flipped = lastChar === "A" ? "B" : "A";
    payload.enc = payload.enc.slice(0, -1,) + flipped;
    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow();
  });

  test("tampered nonce throws", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo?: string;
      key_id: string;
    };
    payload.nonce = `${payload.nonce.slice(0, -2,)}AA`;
    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow();
  });
});

// ── Nonce uniqueness ────────────────────────────────────────

describe("nonce uniqueness", () => {
  test("same plaintext with same key produces different ciphertext (random nonce)", async () => {
    const enc1 = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const enc2 = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    expect(enc1,).not.toBe(enc2,);

    // Nonces should differ
    const p1 = JSON.parse(enc1,) as { nonce: string };
    const p2 = JSON.parse(enc2,) as { nonce: string };
    expect(p1.nonce,).not.toBe(p2.nonce,);
  });
});

// ── Compression algorithm validation ────────────────────────

describe("compression algorithm validation", () => {
  test("payload with comp=true but unknown compAlgo throws (no silent fallback)", async () => {
    // Encrypt normally, then corrupt the algorithm marker. The previous
    // behavior silently fell back to gzip and returned base64 ciphertext
    // to the user as plaintext — see BUG-safedecompress-pre-check.
    const text = "x".repeat(200,);
    const encrypted = await compressThenEncrypt({
      plaintext: text,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: { threshold: 128, algorithm: "gzip", },
    },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo: string;
      key_id: string;
    };

    payload.comp = true;
    payload.compAlgo = "bogus-algo";

    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow(
      /Decompression failed|Unknown algorithm|Malformed encrypted payload/,
    );
  });

  test("payload with comp=true but missing compAlgo throws (legacy data / tampering)", async () => {
    // Legacy rows written before the compAlgo fix have comp=true with no
    // compAlgo field. The new behavior fails loudly instead of silently
    // returning the compressed ciphertext as "plaintext".
    const text = "x".repeat(200,);
    const encrypted = await compressThenEncrypt({
      plaintext: text,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: { threshold: 128, algorithm: "gzip", },
    },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo?: string;
      key_id: string;
    };

    payload.comp = true;
    delete payload.compAlgo;

    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow(
      "Malformed encrypted payload: comp=true but compAlgo is missing",
    );
  });

  test("payload with comp=true and valid compAlgo decrypts + decompresses normally", async () => {
    // Sanity check: the happy path still works end-to-end. A > 10KB
    // compressed payload would have hit the buggy pre-check previously.
    const text = "x".repeat(2_000,);
    const encrypted = await compressThenEncrypt({
      plaintext: text,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: { threshold: 128, algorithm: "gzip", },
    },);
    const payload = JSON.parse(encrypted,) as {
      comp: boolean;
      compAlgo?: string;
    };
    expect(payload.comp,).toBe(true,);
    expect(payload.compAlgo,).toBe("gzip",);

    const decrypted = await decryptThenDecompress(encrypted, cryptoKey,);
    expect(decrypted,).toBe(text,);
  });
});
describe("isEncryptedPayload strict shape validation (BUG-encrypted-payload-sniffing)", () => {
  test("rejects a forged payload with garbage nonce (not 12 bytes)", () => {
    const forged = '{"enc":"AAAA","nonce":"y","algo":"aes-256-gcm","key_id":"k1"}';
    expect(isEncryptedPayload(forged,),).toBe(false,);
  });

  test("rejects a forged payload with garbage enc (not base64)", () => {
    const nonceB64 = new Uint8Array(12,).toBase64();
    const forged = `{"enc":"!!!not-base64!!!","nonce":"${nonceB64}","algo":"aes-256-gcm","key_id":"k1"}`;
    expect(isEncryptedPayload(forged,),).toBe(false,);
  });

  test("rejects a forged payload missing required fields", () => {
    expect(isEncryptedPayload('{"enc":"x","nonce":"y"}',),).toBe(false,);
  });

  test("rejects wrong algorithm", () => {
    const nonceB64 = new Uint8Array(12,).toBase64();
    const encB64 = new Uint8Array(16,).toBase64();
    const forged = `{"enc":"${encB64}","nonce":"${nonceB64}","algo":"aes-128-cbc","key_id":"k1"}`;
    expect(isEncryptedPayload(forged,),).toBe(false,);
  });

  test("accepts a well-formed payload produced by compressThenEncrypt", async () => {
    const enc = await compressThenEncrypt({
      plaintext: "real encrypted",
      chatKey: cryptoKey,
      keyId: KEY_ID,
    },);
    expect(isEncryptedPayload(enc,),).toBe(true,);
  });
});
