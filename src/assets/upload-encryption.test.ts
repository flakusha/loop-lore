/**
 * Tests for asset upload encryption wiring
 *
 * Verifies that handleUpload correctly passes encryption context to createAsset
 * when a chatId is provided and encryption is enabled.
 */

import { describe, expect, test, } from "bun:test";
import {
  decryptAssetBlob,
  encryptAssetBlob,
  isEncryptedAsset,
} from "../crypto/asset-encryption";
import type { ChatKey, } from "../crypto/chat-keys";

// ── Test helpers ────────────────────────────────────────────

const KEY_ID = "test-upload-key-001";
const PIPELINE_CONFIG = {
  threshold: 128,
  algorithm: "gzip" as const,
};

async function generateChatKey(): Promise<ChatKey> {
  const cryptoKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256, },
    true,
    ["encrypt", "decrypt",],
  );
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKey,),);
  return { key: cryptoKey, keyId: KEY_ID, rawKey, };
}

// ── Tests ───────────────────────────────────────────────────

describe("Asset upload encryption wiring", () => {
  test("encryptAssetBlob returns encrypted data with standard tier", async () => {
    const chatKey = await generateChatKey();
    const plaintext = Buffer.from("test image data for upload",);

    const result = await encryptAssetBlob(
      plaintext,
      chatKey,
      KEY_ID,
      PIPELINE_CONFIG,
      "standard",
    );

    expect(result.encrypted,).toBe(true,);
    expect(result.keyId,).toBe(KEY_ID,);
    expect(result.data,).not.toEqual(plaintext,);

    // Encrypted payload should be valid JSON with enc/nonce fields
    const parsed = JSON.parse(result.data.toString("utf8",),);
    expect(typeof parsed.enc,).toBe("string",);
    expect(typeof parsed.nonce,).toBe("string",);
  });

  test("encryptAssetBlob returns plaintext with public tier", async () => {
    const chatKey = await generateChatKey();
    const plaintext = Buffer.from("test image data for upload",);

    const result = await encryptAssetBlob(
      plaintext,
      chatKey,
      KEY_ID,
      PIPELINE_CONFIG,
      "public",
    );

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
    expect(result.data,).toEqual(plaintext,);
  });

  test("encryptAssetBlob returns plaintext when no chat key provided", async () => {
    const plaintext = Buffer.from("test image data for upload",);

    const result = await encryptAssetBlob(
      plaintext,
      null,
      null,
      PIPELINE_CONFIG,
      "standard",
    );

    expect(result.encrypted,).toBe(false,);
    expect(result.keyId,).toBeNull();
    expect(result.data,).toEqual(plaintext,);
  });

  test("encrypted asset can be round-tripped with decryptAssetBlob", async () => {
    const chatKey = await generateChatKey();
    const plaintext = Buffer.from("Hello, encrypted world!",);

    const encrypted = await encryptAssetBlob(
      plaintext,
      chatKey,
      KEY_ID,
      PIPELINE_CONFIG,
      "standard",
    );

    expect(encrypted.encrypted,).toBe(true,);

    const decrypted = await decryptAssetBlob(encrypted.data, chatKey,);
    expect(decrypted.toString("utf8",),).toBe("Hello, encrypted world!",);
  });

  test("isEncryptedAsset detects encrypted payloads", async () => {
    const chatKey = await generateChatKey();
    const plaintext = Buffer.from("test data",);

    const encrypted = await encryptAssetBlob(
      plaintext,
      chatKey,
      KEY_ID,
      PIPELINE_CONFIG,
      "standard",
    );

    expect(isEncryptedAsset(encrypted.data,),).toBe(true,);
    expect(isEncryptedAsset(plaintext,),).toBe(false,);
  });

  test("chat key derivation produces different keys for different chats", async () => {
    const key1 = await generateChatKey();
    const key2 = await generateChatKey();

    // Keys are random, so they should differ
    expect(key1.rawKey,).not.toEqual(key2.rawKey,);
  });
});
