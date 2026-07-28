/**
 * Tests for crypto/asset-encryption.ts — Asset blob encrypt/decrypt
 */

import { beforeAll, describe, expect, test, } from "bun:test";
import {
  decryptAssetBlob,
  encryptAssetBlob,
  isEncryptedAsset,
} from "./asset-encryption";
import type { ChatKey, } from "./chat-keys";

const KEY_ID = "test-asset-key-001";
const PIPELINE_CONFIG = {
  threshold: 128,
  algorithm: "gzip" as const,
};

let cryptoKey: CryptoKey;
let rawKey: Uint8Array;
let chatKey: ChatKey;

beforeAll(async () => {
  cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256, },
    true,
    ["encrypt", "decrypt",],
  );
  rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKey,),);
  chatKey = { key: cryptoKey, keyId: KEY_ID, rawKey, };
},);

// ── isEncryptedAsset ───────────────────────────────────────

describe("isEncryptedAsset", () => {
  test("returns true for valid encrypted payload", () => {
    const payload = JSON.stringify({
      enc: "base64data",
      nonce: "base64nonce",
      key_id: KEY_ID,
      algo: "aes-256-gcm",
    },);
    expect(isEncryptedAsset(Buffer.from(payload,),),).toBe(true,);
  });

  test("returns false for plaintext", () => {
    expect(isEncryptedAsset(Buffer.from("Hello, World!",),),).toBe(false,);
  });

  test("returns false for non-JSON", () => {
    expect(isEncryptedAsset(Buffer.from("<html>not json</html>",),),).toBe(false,);
  });

  test("returns false for JSON without enc/nonce", () => {
    const payload = JSON.stringify({ foo: "bar", },);
    expect(isEncryptedAsset(Buffer.from(payload,),),).toBe(false,);
  });

  test("returns false for empty buffer", () => {
    expect(isEncryptedAsset(Buffer.alloc(0,),),).toBe(false,);
  });

  test("returns false for JSON array", () => {
    expect(isEncryptedAsset(Buffer.from("[1,2,3]",),),).toBe(false,);
  });
});

// ── encryptAssetBlob ───────────────────────────────────────

describe("encryptAssetBlob", () => {
  test("public tier returns plaintext buffer unchanged", async () => {
    const input = Buffer.from("raw image bytes",);
    const result = await encryptAssetBlob(input, chatKey, KEY_ID, PIPELINE_CONFIG, "public",);

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
    expect(result.data,).toEqual(input,);
  });

  test("null chatKey returns plaintext buffer unchanged", async () => {
    const input = Buffer.from("raw bytes",);
    const result = await encryptAssetBlob(input, null, KEY_ID, PIPELINE_CONFIG, "standard",);

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
    expect(result.data,).toEqual(input,);
  });

  test("null keyId returns plaintext buffer unchanged", async () => {
    const input = Buffer.from("raw bytes",);
    const result = await encryptAssetBlob(input, chatKey, null, PIPELINE_CONFIG, "standard",);

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
    expect(result.data,).toEqual(input,);
  });

  test("standard tier encrypts the blob", async () => {
    const input = Buffer.from("sensitive image data",);
    const result = await encryptAssetBlob(input, chatKey, KEY_ID, PIPELINE_CONFIG, "standard",);

    expect(result.encrypted,).toBe(true,);
    expect(result.keyId,).toBe(KEY_ID,);
    expect(isEncryptedAsset(result.data,),).toBe(true,);
  });

  test("encrypted blob can be decrypted back to original", async () => {
    const input = Buffer.from("round-trip test data",);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey,);

    expect(decrypted,).toEqual(input,);
  });

  test("handles empty buffer", async () => {
    const input = Buffer.alloc(0,);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey,);

    expect(decrypted,).toEqual(input,);
  });

  test("handles large buffer (64KB)", async () => {
    const input = Buffer.alloc(64 * 1024, 0xAB,);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey,);

    expect(decrypted,).toEqual(input,);
  });

  test("handles unicode content", async () => {
    const input = Buffer.from("日本語テスト 🔐 Здравствуй", "utf8",);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey,);

    expect(decrypted,).toEqual(input,);
  });
});

// ── decryptAssetBlob error cases ───────────────────────────

describe("decryptAssetBlob — error cases", () => {
  test("throws on invalid/corrupted encrypted buffer", async () => {
    const corrupted = Buffer.from('{"enc":"baddata","nonce":"bad","key_id":"x","algo":"aes-256-gcm"}',);

    await expect(decryptAssetBlob(corrupted, chatKey,),).rejects.toThrow();
  });

  test("throws on non-JSON input", async () => {
    const garbage = Buffer.from("not encrypted at all",);

    await expect(decryptAssetBlob(garbage, chatKey,),).rejects.toThrow();
  });
});
