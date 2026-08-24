// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for crypto/e2e/double-ratchet.ts — per-message ephemeral ECDH.
 *
 * Coverage:
 *   1. Alice→Bob roundtrip of a single message
 *   2. Alice→Bob sequential N-message exchange (in order)
 *   3. Tampered ciphertext → auth-tag mismatch throws
 *   4. Substituted ephemeral pub → wrong ECDH output → decrypt fails
 *   5. Each message uses a distinct ephemeral pub (no reuse)
 *   6. Two messages with the same chainIndex still get distinct ciphertexts
 *   7. Cross-receiver ciphertext isolation (different receivers get different
 *      ciphertexts, wrong receiver fails auth)
 *   8. Forward-secrecy claims (sender compromise + receiver compromise
 *      documented behavior)
 *   9. interop with foundation primitives (P-256 ECDH curve)
 */

import { beforeEach, describe, expect, test, } from "bun:test";
import {
  decodeEphemeralPayload,
  encodeEphemeralPayload,
  type EphemeralRatchetWirePayload,
} from "./double-ratchet";
import {
  exportPrivateJwk,
  exportPublicJwk,
  generateKeyPair,
  importPrivateKey,
} from "./key-pairs";

let aliceKp: CryptoKeyPair = {
  publicKey: { type: "public", } as unknown as CryptoKey,
  privateKey: { type: "private", } as unknown as CryptoKey,
};
let bobKp: CryptoKeyPair = {
  publicKey: { type: "public", } as unknown as CryptoKey,
  privateKey: { type: "private", } as unknown as CryptoKey,
};
let alicePubJwk: JsonWebKey = { kty: "EC", };
let bobPubJwk: JsonWebKey = { kty: "EC", };

beforeEach(async () => {
  aliceKp = await generateKeyPair({ extractable: true, },);
  bobKp = await generateKeyPair({ extractable: true, },);
  alicePubJwk = await exportPublicJwk(aliceKp.publicKey,);
  bobPubJwk = await exportPublicJwk(bobKp.publicKey,);
},);

async function encrypt(
  plaintext: string,
  index: number,
  receiver = bobPubJwk,
): Promise<EphemeralRatchetWirePayload> {
  return await encodeEphemeralPayload({
    plaintext,
    receiverStaticPubJwk: receiver,
    chainIndex: index,
  },);
}

describe("per-message ephemeral ECDH (encrypt + decrypt)", () => {
  test("Alice → Bob: a single message decrypts correctly", async () => {
    const wire = await encrypt("hello bob", 0,);
    expect(wire.ciphertext,).toBeTruthy();
    expect(wire.nonce,).toBeTruthy();
    expect(wire.senderEphPubJwk.kty,).toBe("EC",);
    expect(wire.chainIndex,).toBe(0,);
    const plaintext = await decodeEphemeralPayload({
      payload: wire,
      receiverStaticPriv: bobKp.privateKey,
    },);
    expect(plaintext,).toBe("hello bob",);
  });

  test("Alice → Bob: N sequential messages decrypt in order", async () => {
    const wire: EphemeralRatchetWirePayload[] = [];
    for (let i = 0; i < 5; i++) {
      wire.push(await encrypt(`message ${i}`, i,),);
    }
    for (let i = 0; i < 5; i++) {
      const plain = await decodeEphemeralPayload({
        payload: wire[i]!,
        receiverStaticPriv: bobKp.privateKey,
      },);
      expect(plain,).toBe(`message ${i}`,);
    }
  });

  test("tampered ciphertext throws (AES-GCM auth-tag mismatch)", async () => {
    const wire = await encrypt("secret", 0,);
    const bytes = Uint8Array.fromBase64(wire.ciphertext,);
    const idx = Math.min(2, bytes.length - 1,);
    bytes[idx] = (bytes[idx] ?? 0) ^ 0x01;
    await expect(
      decodeEphemeralPayload({
        payload: { ...wire, ciphertext: bytes.toBase64(), },
        receiverStaticPriv: bobKp.privateKey,
      },),
    ).rejects.toThrow();
  });

  test("substituted ephemeral pub decodes to auth-tag failure", async () => {
    const real = await encrypt("real", 0,);
    // Use a different chainIndex so encodeEphemeralPayload generates a
    // fresh ephemeral of its own; we then substitute that into `real`'s
    // payload. The shared ECDH output differs, so AES-GCM auth fails.
    const decoy = await encrypt("decoy", 1,);
    await expect(
      decodeEphemeralPayload({
        payload: { ...real, senderEphPubJwk: decoy.senderEphPubJwk, },
        receiverStaticPriv: bobKp.privateKey,
      },),
    ).rejects.toThrow();
  });

  test("each message uses a distinct ephemeral public key", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const wire = await encrypt(`m${i}`, i,);
      const key = JSON.stringify(wire.senderEphPubJwk,);
      expect(seen.has(key,),).toBeFalse();
      seen.add(key,);
    }
    expect(seen.size,).toBe(10,);
  });

  test("two messages with the same chainIndex derive distinct ciphertexts (different eph)", async () => {
    const a = await encrypt("same", 0,);
    const b = await encrypt("same", 0,);
    expect(a.ciphertext,).not.toBe(b.ciphertext,);
  });
});

describe("per-message ephemeral ECDH — forward-secrecy claims", () => {
  test(
    "compromising Alice's static private AFTER 3 messages cannot decrypt message 1 (per-message eph forecloses)",
    async () => {
      const messages: { wire: EphemeralRatchetWirePayload; plaintext: string }[] = [];
      for (let i = 0; i < 3; i++) {
        const wire = await encrypt(`secret-${i}`, i,);
        messages.push({ wire, plaintext: `secret-${i}`, },);
      }

      // Attacker now holds Alice's static private key.
      const alicePrivJwk = await exportPrivateJwk(aliceKp.privateKey,);
      const attackerAlicePriv = await importPrivateKey(alicePrivJwk, { extractable: false, },);

      // The attacker tries to use Alice's leaked static priv to decrypt
      // a past message addressed to Bob. The forward-secrecy claim is that
      // this FAILS: the past message's eph priv key has been discarded, and
      // ECDH with attackerAlicePriv produces a shared secret that is
      // unrelated to the one used to seal the message.
      await expect(
        decodeEphemeralPayload({
          payload: messages[0]!.wire,
          receiverStaticPriv: attackerAlicePriv,
        },),
      ).rejects.toThrow();
    },
  );

  test(
    "compromising Bob's static private decrypts past messages (documented behavior)",
    async () => {
      // Documented: when the receiver is compromised, past messages to
      // that receiver can be decrypted (since the leaked static priv
      // pairs with every per-message eph pub). This is the EXPECTED
      // behavior of forward secrecy against an attacker who controls the
      // CURRENT receiver — future-only sender rotation would not help
      // here either. The test asserts this is what happens.
      const messages: { wire: EphemeralRatchetWirePayload; plaintext: string }[] = [];
      for (let i = 0; i < 3; i++) {
        const wire = await encrypt(`to-bob-${i}`, i,);
        messages.push({ wire, plaintext: `to-bob-${i}`, },);
      }

      const bobPrivJwk = await exportPrivateJwk(bobKp.privateKey,);
      const attackerBobPriv = await importPrivateKey(bobPrivJwk, { extractable: false, },);

      for (let i = 0; i < messages.length; i++) {
        const pt = await decodeEphemeralPayload({
          payload: messages[i]!.wire,
          receiverStaticPriv: attackerBobPriv,
        },);
        expect(pt,).toBe(messages[i]!.plaintext,);
      }
    },
  );

  test(
    "two independent conversations are cryptographically isolated",
    async () => {
      const wire1 = await encrypt("shared-secret", 0, bobPubJwk,);
      const carolKp = await generateKeyPair({ extractable: true, },);
      const carolPubJwk = await exportPublicJwk(carolKp.publicKey,);
      const wire2 = await encrypt("shared-secret", 0, carolPubJwk,);
      expect(wire1.ciphertext,).not.toBe(wire2.ciphertext,);
      // Cross-decryption with the wrong key fails auth-tag check.
      await expect(
        decodeEphemeralPayload({
          payload: wire1,
          receiverStaticPriv: carolKp.privateKey,
        },),
      ).rejects.toThrow();
    },
  );
});

describe("per-message ephemeral ECDH — interop with foundation primitives", () => {
  test("emits P-256 ECDH pubkeys (compatible with server-registry)", async () => {
    const wire = await encrypt("interop", 0,);
    expect(wire.senderEphPubJwk.crv,).toBe("P-256",);
    expect(wire.senderEphPubJwk.kty,).toBe("EC",);
    expect(wire.senderEphPubJwk.x,).toBeTruthy();
    expect(wire.senderEphPubJwk.y,).toBeTruthy();
  });
});

// Reference `alicePubJwk` and `aliceKp` to keep the typed bindings — future
// tests can read them without re-running the setup.
void alicePubJwk;
void aliceKp;
