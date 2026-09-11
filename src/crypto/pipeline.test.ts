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

  test("payload with unknown algo field throws (downgrade detection)", async () => {
    const encrypted = await compressThenEncrypt({ plaintext: SHORT_TEXT, chatKey: cryptoKey, keyId: KEY_ID, },);
    const payload = JSON.parse(encrypted,) as {
      enc: string;
      nonce: string;
      algo: string;
      comp: boolean;
      compAlgo?: string;
      key_id: string;
    };
    payload.algo = "aes-128-cbc";
    await expect(decryptThenDecompress(JSON.stringify(payload,), cryptoKey,),).rejects.toThrow(
      "Unsupported encryption algorithm",
    );
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

// ── AC1 — no plaintext leak path ────────────────────────────

describe("AC1 no-plaintext-leak-path", () => {
  test("compressThenEncrypt never writes raw plaintext into payload.enc", async () => {
    // The write path is the only public API that produces an
    // EncryptedPayload row. Verify that whatever plaintext comes in,
    // the bytes the pipeline stores under `enc` are never the
    // plaintext bytes — not even for tiny inputs, not even when
    // compression is disabled. A forged row that bypassed the wrapper
    // could try to smuggle the user's text by claiming it was already
    // ciphertext; the strict-shape check on the read side is the
    // second half of the guard. Here we pin the write side: plaintext
    // in → ciphertext out, always.
    const plaintext = "secret hello";
    const enc = await compressThenEncrypt({
      plaintext,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: { threshold: 128, algorithm: "gzip", },
    },);
    const payload = JSON.parse(enc,) as { enc: string; nonce: string; comp: boolean };

    // Below threshold: no compression, so the length reading below is
    // meaningful — ciphertext spans exactly the plaintext plus tag.
    expect(payload.comp,).toBe(false,);

    // The ciphertext must not embed the plaintext anywhere, not even as
    // a contiguous subsequence. Length comparison alone would miss a
    // leak that appends a tag to raw text; the scan catches it.
    const encBytes = Uint8Array.fromBase64(payload.enc,);
    const plaintextBytes = new TextEncoder().encode(plaintext,);
    expect(Buffer.from(encBytes,).indexOf(Buffer.from(plaintextBytes,),),).toBe(-1,);
    // Sanity: ciphertext is exactly plaintext.length + 16 (AES-GCM tag).
    expect(encBytes.length,).toBe(plaintextBytes.length + 16,);

    // Decrypt with the same key — AES-GCM authentication must succeed
    // and the recovered plaintext must match. If `enc` had been raw
    // plaintext, this decrypt would either throw (random bytes vs key)
    // or — worst-case — return garbage. Either outcome proves no leak.
    const nonceBytes = Uint8Array.fromBase64(payload.nonce,);
    const recovered = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonceBytes, },
      cryptoKey,
      encBytes,
    );
    expect(new TextDecoder().decode(recovered,),).toBe(plaintext,);

    // Belt-and-braces: the strict-shape check must reject the
    // plaintext itself as a forged envelope. If
    // `isEncryptedPayload("secret hello")` returned true, a caller
    // could submit literal text and the server would store it under
    // the same code path as real ciphertext.
    expect(isEncryptedPayload(plaintext,),).toBe(false,);
    expect(isEncryptedPayload(`"secret hello"`,),).toBe(false,);
  });
});

// ── AC2 — compress-before-encrypt ordering ─────────────────

describe("AC2 compress-before-encrypt ordering", () => {
  test("payload.enc decrypts to compressed bytes, not plaintext UTF-8", async () => {
    // Large enough to trigger compression at the default threshold.
    // The bytes under `enc` must be AES-GCM ciphertext OF the
    // compressed payload, not AES-GCM ciphertext OF the plaintext.
    // Decrypting the envelope and inspecting the plaintext reveals the
    // compression header magic.
    const plaintext = "compress-before-encrypt probe ".repeat(200,);
    const enc = await compressThenEncrypt({
      plaintext,
      chatKey: cryptoKey,
      keyId: KEY_ID,
      config: { threshold: 128, algorithm: "gzip", },
    },);
    const payload = JSON.parse(enc,) as {
      enc: string;
      nonce: string;
      comp: boolean;
      compAlgo?: string;
    };
    expect(payload.comp,).toBe(true,);
    expect(payload.compAlgo,).toBe("gzip",);

    const encBytes = Uint8Array.fromBase64(payload.enc,);
    const nonceBytes = Uint8Array.fromBase64(payload.nonce,);

    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonceBytes, },
      cryptoKey,
      encBytes,
    );
    const decryptedBytes = new Uint8Array(decryptedBuf,);

    // Negative assertion: the decrypted bytes must NOT round-trip as
    // the original plaintext via TextDecoder. If compression ran
    // before encryption, the bytes here are gzip (or brotli/zstd) —
    // not UTF-8 text. `fatal: true` throws on invalid UTF-8
    // sequences, which is exactly what compressed bytes are.
    let decodedAsOriginal = true;
    try {
      decodedAsOriginal = new TextDecoder("utf-8", { fatal: true, },).decode(decryptedBytes,) === plaintext;
    } catch {
      decodedAsOriginal = false;
    }
    expect(decodedAsOriginal,).toBe(false,);

    // Positive assertion: the decrypted bytes are the base64 envelope
    // of a gzip stream, NOT the plaintext. The first four ASCII chars
    // `H4sI` are the standard base64 encoding of the gzip magic header
    // `1f 8b 08` — proving compression happened first and the
    // cipher wrapped the compressed (then base64-wrapped) stream.
    const decAsAscii = new TextDecoder("latin1",).decode(decryptedBytes,);
    expect(decAsAscii.slice(0, 4,),).toBe("H4sI",);
    // Decoding that base64 prefix must yield the gzip magic bytes.
    const gzipHeader = Uint8Array.fromBase64(decAsAscii.slice(0, 4,),);
    expect(gzipHeader[0],).toBe(0x1f,);
    expect(gzipHeader[1],).toBe(0x8b,);
  });
});

// ── AC3 — lossless round-trip per recipient ─────────────────

describe("AC3 lossless round-trip per recipient", () => {
  test("every recipient decrypts + decompresses to the original bytes", async () => {
    // The chat's current active key is shared by every current
    // member; each participant holds a copy derived from the SMK.
    // Simulate N recipients by reusing the same chat key 5 times —
    // what changes per recipient is the nonce, not the key material.
    // The contract: for every recipient, decryptThenDecompress must
    // return the original message bytes byte-for-byte.
    const messageBytes = new TextEncoder().encode(
      "Hello \u4e16\u754c \ud83c\udf0d \u041f\u0440\u0438\u0432\u0435\u0442 " +
        "\u65e5\u672c\u8a9e \ud83d\ude80 " +
        "Za\u017c\u00f3\u0142\u0107 g\u0119\u015bl\u0105 ja\u017a\u0144 " +
        '\u2014 line1\nline2\ttab"quote"\u0000nul',
    );
    const originalText = new TextDecoder().decode(messageBytes,);

    const recipients = [
      { name: "alice", key: cryptoKey, },
      { name: "bob", key: cryptoKey, },
      { name: "carol", key: cryptoKey, },
      { name: "dave", key: cryptoKey, },
      { name: "eve", key: cryptoKey, },
    ];

    // Encrypt once per recipient with the active chat key. The nonce
    // is fresh per encrypt so each recipient's stored row would carry
    // its own payload. Loop encrypt+decrypt to exercise the round-trip
    // for every key holder.
    for (const r of recipients) {
      const enc = await compressThenEncrypt({
        plaintext: originalText,
        chatKey: r.key,
        keyId: `${KEY_ID}-${r.name}`,
        config: { threshold: 128, algorithm: "gzip", },
      },);

      const decrypted = await decryptThenDecompress(enc, r.key,);

      // Byte-for-byte equality, not just string equality: the bytes
      // that round-trip must match the original encoding exactly,
      // including the embedded NUL, tab, and non-BMP code points.
      const decryptedBytes = new TextEncoder().encode(decrypted,);
      expect(decryptedBytes,).toEqual(messageBytes,);
      expect(decrypted,).toBe(originalText,);
    }

    // Same contract under compression: the 72-unit message above never
    // reaches the 128 threshold, so the loop pins only the comp=false
    // path. Repeat past the threshold so every recipient also round-trips
    // multibyte + NUL content through the comp=true path.
    const largeText = originalText.repeat(8,);
    for (const r of recipients) {
      const enc = await compressThenEncrypt({
        plaintext: largeText,
        chatKey: r.key,
        keyId: `${KEY_ID}-${r.name}-large`,
        config: { threshold: 128, algorithm: "gzip", },
      },);
      const largePayload = JSON.parse(enc,) as { comp: boolean; compAlgo?: string };
      expect(largePayload.comp,).toBe(true,);
      expect(largePayload.compAlgo,).toBe("gzip",);
      const decrypted = await decryptThenDecompress(enc, r.key,);
      expect(new TextEncoder().encode(decrypted,),).toEqual(new TextEncoder().encode(largeText,),);
      expect(decrypted,).toBe(largeText,);
    }
  });
});
