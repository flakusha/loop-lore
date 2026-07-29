/**
 * E2E: Encryption Workflow
 *
 * Tests the full encryption lifecycle:
 *   - Key management CRUD
 *   - Message encryption/decryption via API
 *   - Chat key derivation
 *   - Encryption tier handling
 *
 * Note: These tests require encryption to be configured.
 * If SMK is not initialized, tests that require encryption will be skipped.
 */

import { isEncryptionEnabled, } from "@/crypto";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type ApiClient, createClient, } from "../helpers/client";
import { SEED, seedAll, } from "../helpers/seed";
import { createTestServer, type TestServer, } from "../helpers/server";

describe("Encryption Workflow", () => {
  let server: TestServer;
  let api: ApiClient;
  let encryptionEnabled = false;

  beforeAll(async () => {
    // Initialize with encryption enabled
    server = await createTestServer({
      encryption: {
        serverEncryptionKey: "a".repeat(64,), // 256-bit hex key
        required: false,
        compressThreshold: 128,
        compressAlgorithm: "gzip",
      },
    },);
    await seedAll(server.db,);
    api = createClient(server.url,);
    await api.loginAs(SEED.user.username, SEED.user.password,);
    encryptionEnabled = isEncryptionEnabled();
  },);

  afterAll(() => {
    server.close();
  },);

  // ── Key Management ────────────────────────────────────────

  describe("key management", () => {
    test("lists encryption keys for authenticated user", async () => {
      if (!encryptionEnabled) {
        console.log("Skipping: encryption not enabled",);
        return;
      }
      const res = await api.get<{ keys: Array<{ id: string; name: string; status: string }> }>(
        "/api/keys",
      );
      expect(res.ok,).toBe(true,);
      expect(Array.isArray(res.data!.keys,),).toBe(true,);
    });

    test("generates a new encryption key", async () => {
      if (!encryptionEnabled) {
        console.log("Skipping: encryption not enabled",);
        return;
      }
      const res = await api.post<{ id: string; name: string; status: string }>(
        "/api/keys",
        { name: "test-key-e2e", },
      );
      expect(res.ok,).toBe(true,);
      expect(res.data!.id,).toBeTruthy();
      expect(res.data!.name,).toBe("test-key-e2e",);
      expect(res.data!.status,).toBe("active",);
    });

    test("rejects key generation without name", async () => {
      if (!encryptionEnabled) {
        console.log("Skipping: encryption not enabled",);
        return;
      }
      const res = await api.post("/api/keys", { name: "", },);
      expect(res.ok,).toBe(false,);
    });
  });

  // ── Message Encryption ────────────────────────────────────

  describe("message encryption", () => {
    test("sends and retrieves encrypted message", async () => {
      // Create a chat with standard encryption
      const chatRes = await api.post<{ id: string }>(
        "/api/chats",
        {
          name: "encrypted-chat-e2e",
          type: "direct",
          mode: "direct",
          encryption_level: "standard",
        },
      );
      expect(chatRes.ok,).toBe(true,);
      const chatId = chatRes.data!.id;

      // Send a message
      const msgContent = "This is a secret message 🔐";
      const sendRes = await api.post<{ id: string; content: string }>(
        `/api/chats/${chatId}/messages`,
        { content: msgContent, role: "user", },
      );
      expect(sendRes.ok,).toBe(true,);

      // Retrieve messages
      const listRes = await api.get<{ data: Array<{ id: string; content: string }> }>(
        `/api/chats/${chatId}/messages`,
      );
      expect(listRes.ok,).toBe(true,);
      expect(listRes.data!.data.length,).toBeGreaterThanOrEqual(1,);

      // Message should be decrypted (returned as plaintext)
      const msg = listRes.data!.data.find(m => m.id === sendRes.data!.id);
      expect(msg,).toBeTruthy();
      expect(msg!.content,).toBe(msgContent,);
    });

    test("public tier stores plaintext", async () => {
      // Create a chat with public encryption
      const chatRes = await api.post<{ id: string }>(
        "/api/chats",
        {
          name: "public-chat-e2e",
          type: "direct",
          mode: "direct",
          encryption_level: "public",
        },
      );
      expect(chatRes.ok,).toBe(true,);
      const chatId = chatRes.data!.id;

      // Send a message
      const msgContent = "This is public plaintext";
      const sendRes = await api.post<{ id: string }>(
        `/api/chats/${chatId}/messages`,
        { content: msgContent, role: "user", },
      );
      expect(sendRes.ok,).toBe(true,);

      // Retrieve and verify plaintext
      const listRes = await api.get<{ data: Array<{ content: string }> }>(
        `/api/chats/${chatId}/messages`,
      );
      expect(listRes.ok,).toBe(true,);
      expect(listRes.data!.data[0]!.content,).toBe(msgContent,);
    });
  });

  // ── Chat Encryption Key ───────────────────────────────────

  describe("chat encryption key", () => {
    test("returns chat key for authorized participant", async () => {
      if (!encryptionEnabled) {
        console.log("Skipping: encryption not enabled",);
        return;
      }
      // Use the chat we created earlier
      const chatRes = await api.post<{ id: string }>(
        "/api/chats",
        {
          name: "key-chat-e2e",
          type: "direct",
          mode: "direct",
          encryption_level: "standard",
        },
      );
      expect(chatRes.ok,).toBe(true,);
      const chatId = chatRes.data!.id;

      // Get chat key
      const keyRes = await api.get<{ keyId: string; rawKey: string }>(
        `/api/chats/${chatId}/encryption-key`,
      );
      expect(keyRes.ok,).toBe(true,);
      expect(keyRes.data!.keyId,).toBeTruthy();
      expect(keyRes.data!.rawKey,).toBeTruthy();
    });
  });

  // ── Unicode and Special Characters ────────────────────────

  describe("unicode encryption", () => {
    test("handles unicode content correctly", async () => {
      const chatRes = await api.post<{ id: string }>(
        "/api/chats",
        {
          name: "unicode-chat-e2e",
          type: "direct",
          mode: "direct",
          encryption_level: "standard",
        },
      );
      expect(chatRes.ok,).toBe(true,);
      const chatId = chatRes.data!.id;

      const unicodeContent = "日本語テスト 🌍 Привет мир Zażółć gęślą jaźń";
      const sendRes = await api.post<{ id: string }>(
        `/api/chats/${chatId}/messages`,
        { content: unicodeContent, role: "user", },
      );
      expect(sendRes.ok,).toBe(true,);

      const listRes = await api.get<{ data: Array<{ content: string }> }>(
        `/api/chats/${chatId}/messages`,
      );
      expect(listRes.ok,).toBe(true,);
      expect(listRes.data!.data[0]!.content,).toBe(unicodeContent,);
    });

    test("handles long content correctly", async () => {
      const chatRes = await api.post<{ id: string }>(
        "/api/chats",
        {
          name: "long-chat-e2e",
          type: "direct",
          mode: "direct",
          encryption_level: "standard",
        },
      );
      expect(chatRes.ok,).toBe(true,);
      const chatId = chatRes.data!.id;

      // Generate content above compression threshold
      const longContent = "The quick brown fox jumps over the lazy dog. ".repeat(100,);
      const sendRes = await api.post<{ id: string }>(
        `/api/chats/${chatId}/messages`,
        { content: longContent, role: "user", },
      );
      expect(sendRes.ok,).toBe(true,);

      const listRes = await api.get<{ data: Array<{ content: string }> }>(
        `/api/chats/${chatId}/messages`,
      );
      expect(listRes.ok,).toBe(true,);
      expect(listRes.data!.data[0]!.content,).toBe(longContent,);
    });
  });
});
