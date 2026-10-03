// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { deriveSearchTokens, } from "../search/encrypted-tokens";
import { ENCRYPTION_SECRET_BYTES, generateEncryptionSecret, isUsableEncryptionSecret, } from "./user-secret";

describe("generateEncryptionSecret", () => {
  test("emits 64 lowercase hex chars (32 bytes of key material)", () => {
    const secret = generateEncryptionSecret();
    expect(secret.length,).toBe(ENCRYPTION_SECRET_BYTES * 2,);
    expect(secret,).toMatch(/^[0-9a-f]{64}$/,);
  });
  test("never repeats across calls — a shared key would leak cross-user equality", () => {
    const secrets = new Set(Array.from({ length: 50, }, () => generateEncryptionSecret(),),);
    expect(secrets.size,).toBe(50,);
  });
  test("two users' keys derive different tokens for the same word", async () => {
    const alice = generateEncryptionSecret();
    const bob = generateEncryptionSecret();
    const [aliceToken,] = await deriveSearchTokens("tavern", alice,);
    const [bobToken,] = await deriveSearchTokens("tavern", bob,);
    expect(aliceToken,).not.toBe(bobToken,);
  });
  test("the same user's key derives stable tokens across calls", async () => {
    const secret = generateEncryptionSecret();
    expect(await deriveSearchTokens("tavern song", secret,),).toEqual(
      await deriveSearchTokens("tavern song", secret,),
    );
  });
});

describe("isUsableEncryptionSecret", () => {
  test("accepts a freshly generated secret", () => {
    expect(isUsableEncryptionSecret(generateEncryptionSecret(),),).toBe(true,);
  });
  test("accepts uppercase hex of the right length", () => {
    expect(isUsableEncryptionSecret("A".repeat(64,),),).toBe(true,);
  });
  test("rejects null, empty, short, long, and non-hex values", () => {
    expect(isUsableEncryptionSecret(null,),).toBe(false,);
    expect(isUsableEncryptionSecret("",),).toBe(false,);
    expect(isUsableEncryptionSecret("a".repeat(63,),),).toBe(false,);
    expect(isUsableEncryptionSecret("a".repeat(65,),),).toBe(false,);
    expect(isUsableEncryptionSecret(`${"a".repeat(63,)}z`,),).toBe(false,);
  });
});
