// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the EncryptionProvider seam (spec §2.3).
 *
 * The passthrough provider doubles as the reference implementation; a
 * hypothetical PgpEncryption proves the seam fits real providers.
 */
import { describe, expect, test, } from "bun:test";
import type { AdapterMessage, } from "./adapter";
import {
  createPassthroughEncryptionProvider,
  type EncryptedMessage,
  type EncryptionProvider,
  type KeyPair,
  PASSTHROUGH_ALGORITHM,
} from "./encryption";

const plaintext: AdapterMessage = {
  id: "m-1",
  author: "@alice:example.org",
  target: "@bob:example.org",
  body: "hello, bob",
  timestamp: 1_700_000_000_000,
};

/** Hypothetical email provider — typecheck proof the seam fits PGP. */
class PgpEncryption implements EncryptionProvider {
  async encrypt(message: AdapterMessage,): Promise<EncryptedMessage> {
    const { body, ...envelope } = message;
    return { algorithm: "pgp", ciphertext: `pgp(${body})`, envelope, };
  }

  async decrypt(message: EncryptedMessage,): Promise<AdapterMessage> {
    return { ...message.envelope, body: message.ciphertext.slice(4, -1,), };
  }

  async generateKeys(): Promise<KeyPair> {
    return { algorithm: "pgp", publicKey: "pk-pgp", privateKey: "sk-pgp", };
  }
}

describe("createPassthroughEncryptionProvider", () => {
  test("round-trips a message unchanged", async () => {
    const provider = createPassthroughEncryptionProvider();
    const restored = await provider.decrypt(await provider.encrypt(plaintext,),);
    expect(restored,).toEqual(plaintext,);
  });

  test("encrypt preserves the routing envelope and tags the algorithm", async () => {
    const encrypted = await createPassthroughEncryptionProvider().encrypt(plaintext,);
    expect(encrypted.algorithm,).toBe(PASSTHROUGH_ALGORITHM,);
    expect(encrypted.ciphertext,).toBe("hello, bob",);
    expect(encrypted.envelope,).toEqual(
      { id: "m-1", author: "@alice:example.org", target: "@bob:example.org", timestamp: 1_700_000_000_000, },
    );
  });

  test("generateKeys yields a keyless keypair shape", async () => {
    const keys = await createPassthroughEncryptionProvider().generateKeys();
    expect(keys.algorithm,).toBe(PASSTHROUGH_ALGORITHM,);
    expect(typeof keys.publicKey,).toBe("string",);
    expect(keys.privateKey,).toBeUndefined();
  });
});

describe("EncryptionProvider seam", () => {
  test("a hypothetical PgpEncryption implements it end-to-end", async () => {
    const provider: EncryptionProvider = new PgpEncryption();
    const restored = await provider.decrypt(await provider.encrypt(plaintext,),);
    expect(restored,).toEqual(plaintext,);

    const keys = await provider.generateKeys();
    expect(keys,).toEqual({ algorithm: "pgp", publicKey: "pk-pgp", privateKey: "sk-pgp", },);
  });
});
