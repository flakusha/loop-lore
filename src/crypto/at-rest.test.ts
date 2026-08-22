/**
 * Tests for crypto/at-rest.ts — tier-aware encryption layer
 */

import { beforeAll, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import {
  decryptAtRest,
  encryptAtRest,
  getChatEncryptionLevel,
  needsEncryption,
} from "./at-rest";
import { compressThenEncrypt, } from "./pipeline";

// ── Mocks ──────────────────────────────────────────────────

const mockDb = {
  selectFrom: mock(() => ({
    select: mock(() => ({
      where: mock(() => ({
        executeTakeFirst: mock(() => Promise.resolve({ encryption_level: "none", },)),
      })),
    })),
  })),
} as unknown as Kysely<DB>;

let testSmk: CryptoKey;
let testKeyId: string;

beforeAll(async () => {
  testSmk = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256, }, true, [
    "encrypt",
    "decrypt",
  ],);
  testKeyId = "test-key-001";
},);

// ── encryptAtRest ──────────────────────────────────────────

describe("encryptAtRest", () => {
  test("none tier stores plaintext as-is", async () => {
    const result = await encryptAtRest({
      database: mockDb,
      chatId: "chat-1",
      plaintext: "Hello, World!",
      encryptionLevel: "none",
    },);

    expect(result.storedContent,).toBe("Hello, World!",);
    expect(result.keyId,).toBeNull();
    expect(result.wasEncrypted,).toBeFalse();
  },);

  test("pre-encrypted content stored as-is regardless of tier", async () => {
    const encrypted = await compressThenEncrypt({
      plaintext: "Already encrypted",
      chatKey: testSmk,
      keyId: testKeyId,
    },);

    const result = await encryptAtRest({
      database: mockDb,
      chatId: "chat-1",
      plaintext: encrypted,
      encryptionLevel: "none",
    },);

    expect(result.storedContent,).toBe(encrypted,);
    expect(result.wasEncrypted,).toBeTrue();
  },);

  test("at-rest tier stores the wire payload verbatim (server does not decrypt)", async () => {
    // Phase D: the server has no chain state for at-rest chats; the
    // client's pre-encrypted payload is stored as-is. Standard-tier
    // behaviour (server encrypts via chat key) does NOT apply here.
    const wire = JSON.stringify({
      e2e: true,
      ciphertext: "opaque-blob",
      nonce: "x",
      senderEphPubJwk: { kty: "EC" },
      chainIndex: 0,
    },);
    const result = await encryptAtRest({
      database: mockDb,
      chatId: "chat-1",
      plaintext: wire,
      encryptionLevel: "at-rest",
    },);
    expect(result.storedContent,).toBe(wire,);
    expect(result.wasEncrypted,).toBe(true,);
  },);

  test("unknown encryption level throws", async () => {
    expect(
      encryptAtRest({
        database: mockDb,
        chatId: "chat-1",
        plaintext: "test",
        encryptionLevel: "unknown" as unknown as never,
      },),
    ).rejects.toThrow("Unknown encryption level",);
  },);
});

// ── decryptAtRest ──────────────────────────────────────────

describe("decryptAtRest", () => {
  test("none tier returns content as-is", async () => {
    const result = await decryptAtRest({
      database: mockDb,
      chatId: "chat-1",
      storedContent: "Plaintext message",
      encryptionLevel: "none",
    },);

    expect(result,).toBe("Plaintext message",);
  },);

  test("standard tier with legacy plaintext returns as-is", async () => {
    const result = await decryptAtRest({
      database: mockDb,
      chatId: "chat-1",
      storedContent: "Legacy plaintext in standard-tier chat",
      encryptionLevel: "standard",
    },);

    expect(result,).toBe("Legacy plaintext in standard-tier chat",);
  },);

  test("at-rest tier returns content unchanged (server has no chain state)", async () => {
    const wire = JSON.stringify({
      e2e: true,
      ciphertext: "client-encrypted",
      nonce: "n",
      senderEphPubJwk: { kty: "EC" },
    },);
    const result = await decryptAtRest({
      database: mockDb,
      chatId: "chat-1",
      storedContent: wire,
      encryptionLevel: "at-rest",
    },);
    expect(result,).toBe(wire,);
  },);

  test("unknown encryption level throws", async () => {
    expect(
      decryptAtRest({
        database: mockDb,
        chatId: "chat-1",
        storedContent: "test",
        encryptionLevel: "unknown" as unknown as never,
      },),
    ).rejects.toThrow("Unknown encryption level",);
  },);
});

// ── needsEncryption ────────────────────────────────────────

describe("needsEncryption", () => {
  test("none tier never needs encryption", () => {
    expect(needsEncryption("none", "plaintext",),).toBeFalse();
  },);

  test("standard tier needs encryption for plaintext", () => {
    expect(needsEncryption("standard", "plaintext",),).toBeTrue();
  },);

  test("at-rest tier needs encryption for plaintext (server-side, but stored as-is)", () => {
    expect(needsEncryption("at-rest", "plaintext",),).toBeTrue();
  },);

  test("already encrypted content does not need encryption", async () => {
    const encrypted = await compressThenEncrypt({
      plaintext: "test",
      chatKey: testSmk,
      keyId: testKeyId,
    },);

    expect(needsEncryption("standard", encrypted,),).toBeFalse();
  },);
});

// ── getChatEncryptionLevel ─────────────────────────────────

describe("getChatEncryptionLevel", () => {
  test("returns encryption level from DB", async () => {
    const mockDbWithLevel = {
      selectFrom: mock(() => ({
        select: mock(() => ({
          where: mock(() => ({
            executeTakeFirst: mock(() => Promise.resolve({ encryption_level: "standard", },)),
          })),
        })),
      })),
    } as unknown as Kysely<DB>;

    const result = await getChatEncryptionLevel(mockDbWithLevel, "chat-1",);
    expect(result,).toBe("standard",);
  },);

  test("returns 'none' when no row found", async () => {
    const mockDbEmpty = {
      selectFrom: mock(() => ({
        select: mock(() => ({
          where: mock(() => ({
            executeTakeFirst: mock(() => Promise.resolve(undefined,)),
          })),
        })),
      })),
    } as unknown as Kysely<DB>;

    const result = await getChatEncryptionLevel(mockDbEmpty, "chat-1",);
    expect(result,).toBe("none",);
  },);
});
