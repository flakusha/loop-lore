/**
 * Tests for crypto/smk.ts — Server Master Key loading
 */

import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { initSmk, getSmk, isEncryptionEnabled } from "./smk";

const VALID_64_HEX = "a".repeat(64); // 32 bytes = 256-bit key
const BASE_ENCRYPTION_CONFIG = { compressThreshold: 128, compressAlgorithm: "gzip" as const };

// Reset SMK state before each test to avoid cross-test pollution
beforeEach(async () => {
  // Calling initSmk with no key and required=false resets activeSmk to null
  await initSmk({ required: false, ...BASE_ENCRYPTION_CONFIG });
});

// Ensure SMK is cleared after all tests — prevents pollution of e2e tests
afterAll(async () => {
  await initSmk({ required: false, ...BASE_ENCRYPTION_CONFIG });
});

describe("initSmk — valid key", () => {
  test("64-char hex key loads SMK and enables encryption", async () => {
    await initSmk({ serverEncryptionKey: VALID_64_HEX, required: false, ...BASE_ENCRYPTION_CONFIG });
    const smk = getSmk();
    expect(smk).not.toBeNull();
    expect(smk!.algorithm.name).toBe("AES-GCM");
    expect(smk!.type).toBe("secret");
    expect(isEncryptionEnabled()).toBe(true);
  });

  test("hex key with dashes and spaces is accepted (cleaned internally)", async () => {
    const dashedKey = "aaaa-bbbb-cccc-dddd-eeee-ffff-0000-1111-2222-3333-4444-5555-6666-7777-8888-9999";
    await initSmk({ serverEncryptionKey: dashedKey, required: false, ...BASE_ENCRYPTION_CONFIG });
    expect(getSmk()).not.toBeNull();
  });

  test("uppercase hex key works", async () => {
    await initSmk({ serverEncryptionKey: VALID_64_HEX.toUpperCase(), required: false, ...BASE_ENCRYPTION_CONFIG });
    expect(getSmk()).not.toBeNull();
  });
});

describe("initSmk — null / dev mode", () => {
  test("no key + required=false returns null (dev mode)", async () => {
    // beforeEach already reset state
    expect(getSmk()).toBeNull();
    expect(isEncryptionEnabled()).toBe(false);
  });

  test("empty string key + required=false returns null", async () => {
    await initSmk({ serverEncryptionKey: "", required: false, ...BASE_ENCRYPTION_CONFIG });
    expect(getSmk()).toBeNull();
  });

  test("whitespace-only key + required=false returns null", async () => {
    await initSmk({ serverEncryptionKey: ' '.repeat(3), required: false, ...BASE_ENCRYPTION_CONFIG });
    expect(getSmk()).toBeNull();
  });
});

describe("initSmk — error paths", () => {
  test("missing key with required=true throws", async () => {
    await expect(initSmk({ required: true, ...BASE_ENCRYPTION_CONFIG })).rejects.toThrow("SERVER_ENCRYPTION_KEY is required");
  });

  test("empty key with required=true throws", async () => {
    await expect(initSmk({ serverEncryptionKey: "", required: true, ...BASE_ENCRYPTION_CONFIG })).rejects.toThrow(
      "SERVER_ENCRYPTION_KEY is required",
    );
  });

  test("invalid hex chars throw", async () => {
    await expect(initSmk({ serverEncryptionKey: "gg".repeat(32), required: false, ...BASE_ENCRYPTION_CONFIG })).rejects.toThrow(
      "Invalid hex byte",
    );
  });

  test("odd-length hex throws", async () => {
    await expect(initSmk({ serverEncryptionKey: "a".repeat(63), required: false, ...BASE_ENCRYPTION_CONFIG })).rejects.toThrow();
  });

  test("short key (16 chars, 8 bytes) throws length error", async () => {
    await expect(initSmk({ serverEncryptionKey: "a".repeat(16), required: false, ...BASE_ENCRYPTION_CONFIG })).rejects.toThrow(
      "must be 64 hex chars",
    );
  });

  test("long key (66 chars, 33 bytes) throws length error", async () => {
    await expect(initSmk({ serverEncryptionKey: "a".repeat(66), required: false, ...BASE_ENCRYPTION_CONFIG })).rejects.toThrow(
      "must be 64 hex chars",
    );
  });
});

describe("isEncryptionEnabled", () => {
  test("returns boolean (false when SMK is null)", () => {
    // beforeEach reset to null
    expect(isEncryptionEnabled()).toBe(false);
  });
});
