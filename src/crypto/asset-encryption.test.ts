/**
 * Tests for crypto/asset-encryption.ts — Asset blob encrypt/decrypt
 */

import { beforeAll, describe, expect, test, } from "bun:test";
import {
  decryptAssetBlob,
  deriveAssetSubkey,
  encryptAssetBlob,
  isEncryptedAsset,
} from "./asset-encryption";
import type { ChatKey, } from "./chat-keys";

import { compressThenEncrypt, decryptThenDecompress, } from "./pipeline";

const KEY_ID = "test-asset-key-001";
const ASSET_ID_A = "asset-aaa-001";
const ASSET_ID_B = "asset-bbb-002";
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
    // Use a fixed v2 payload so the test stays deterministic
    const v2Payload = JSON.stringify({
      enc: "YWJjZGVm", // base64 "abcdef"
      nonce: "MTIzNDU2Nzg5MDEy", // base64 random 12 bytes
      algo: "aes-256-gcm",
      comp: false,
      key_id: KEY_ID,
      a_id: ASSET_ID_A,
    },);
    expect(isEncryptedAsset(Buffer.from(v2Payload,),),).toBe(true,);
  });

  test("returns false for plaintext", () => {
    expect(isEncryptedAsset(Buffer.from("Hello, World!",),),).toBe(false,);
  });

  test("returns false for non-JSON", () => {
    expect(isEncryptedAsset(Buffer.from("<html>not json</html>",),),).toBe(false,);
  });

  test("returns false for JSON without enc/nonce", () => {
    expect(isEncryptedAsset(Buffer.from('{"foo":"bar"}',),),).toBe(false,);
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
    const result = await encryptAssetBlob(input, chatKey, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "public",);

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
    expect(result.data,).toEqual(input,);
  });

  test("null chat key returns plaintext", async () => {
    const input = Buffer.from("raw bytes",);
    const result = await encryptAssetBlob(input, null, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "standard",);

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
  });

  test("null keyId returns plaintext", async () => {
    const input = Buffer.from("raw bytes",);
    const result = await encryptAssetBlob(input, chatKey, null, ASSET_ID_A, PIPELINE_CONFIG, "standard",);

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
  });

  test("encrypts with standard tier and embeds a_id", async () => {
    const input = Buffer.from("sensitive image data",);
    const result = await encryptAssetBlob(input, chatKey, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "standard",);

    expect(result.encrypted,).toBe(true,);
    expect(result.keyId,).toBe(KEY_ID,);

    const parsed = JSON.parse(result.data.toString("utf8",),);
    expect(parsed.a_id,).toBe(ASSET_ID_A,);
    expect(parsed.key_id,).toBe(KEY_ID,);
  });

  test("round-trips a small input", async () => {
    const input = Buffer.from("round-trip test data",);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey, ASSET_ID_A,);

    expect(decrypted,).toEqual(input,);
  });

  test("round-trips an empty buffer", async () => {
    const input = Buffer.alloc(0,);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey, ASSET_ID_A,);

    expect(decrypted,).toEqual(input,);
  });

  test("round-trips a large buffer (forces compression)", async () => {
    const input = Buffer.alloc(64 * 1024, 0xAB,);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey, ASSET_ID_A,);

    expect(decrypted,).toEqual(input,);
  });

  test("round-trips UTF-8 multi-byte input", async () => {
    const input = Buffer.from("日本語テスト 🔐 Здравствуй", "utf8",);
    const encrypted = await encryptAssetBlob(input, chatKey, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "standard",);
    const decrypted = await decryptAssetBlob(encrypted.data, chatKey, ASSET_ID_A,);

    expect(decrypted,).toEqual(input,);
  });
});

// ── decryptAssetBlob error cases ───────────────────────────

describe("decryptAssetBlob — error cases", () => {
  test("throws on invalid/corrupted encrypted buffer", async () => {
    const corrupted = Buffer.from('{"enc":"baddata","nonce":"bad","key_id":"x","algo":"aes-256-gcm","a_id":"x"}',);

    await expect(decryptAssetBlob(corrupted, chatKey, ASSET_ID_A,),).rejects.toThrow();
  });

  test("throws on non-JSON input", async () => {
    const garbage = Buffer.from("not json at all",);

    await expect(decryptAssetBlob(garbage, chatKey, ASSET_ID_A,),).rejects.toThrow();
  });
});

// ── HKDF subkey isolation ──────────────────────────────────

describe("deriveAssetSubkey — isolation guarantees", () => {
  test("different asset ids produce different subkeys", async () => {
    const subkeyA = await deriveAssetSubkey(chatKey, ASSET_ID_A,);
    const subkeyB = await deriveAssetSubkey(chatKey, ASSET_ID_B,);

    const rawA = new Uint8Array(await crypto.subtle.exportKey("raw", subkeyA,),);
    const rawB = new Uint8Array(await crypto.subtle.exportKey("raw", subkeyB,),);

    expect(rawA,).not.toEqual(rawB,);
  });

  test("same asset id produces same subkey (deterministic)", async () => {
    const subkey1 = await deriveAssetSubkey(chatKey, ASSET_ID_A,);
    const subkey2 = await deriveAssetSubkey(chatKey, ASSET_ID_A,);

    const raw1 = new Uint8Array(await crypto.subtle.exportKey("raw", subkey1,),);
    const raw2 = new Uint8Array(await crypto.subtle.exportKey("raw", subkey2,),);

    expect(raw1,).toEqual(raw2,);
  });
  test("asset encrypted with asset A's subkey cannot be decrypted with asset B's key", async () => {
    const plaintext = Buffer.from("confidential image",);
    const encrypted = await encryptAssetBlob(plaintext, chatKey, KEY_ID, ASSET_ID_A, PIPELINE_CONFIG, "standard",);

    // Forcing decrypt to use asset B's subkey (via direct deriveAssetSubkey + decryptThenDecompress)
    // bypasses the v2 payload's a_id — must fail because the ciphertext was sealed under A's key.
    const wrongSubkey = await deriveAssetSubkey(chatKey, ASSET_ID_B,);
    await expect(
      decryptThenDecompress(encrypted.data.toString("utf8",), wrongSubkey,),
    ).rejects.toThrow();
  });

  test("legacy v1 payload (no a_id) still decrypts with direct chat key", async () => {
    const plaintext = Buffer.from("legacy asset data",);

    // Create a real v1 payload by encrypting with chatKey directly (no aId option)
    const realLegacy = await compressThenEncrypt({
      plaintext: plaintext.toString("base64",),
      chatKey: chatKey.key,
      keyId: KEY_ID,
    },);

    const decrypted = await decryptAssetBlob(Buffer.from(realLegacy,), chatKey, ASSET_ID_A,);
    expect(decrypted,).toEqual(plaintext,);
  });
});
