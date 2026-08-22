/**
 * Unit tests for crypto/e2e/key-pairs.ts — ECDH P-256 keypair generation, import,
 * export, and shared-secret derivation.
 *
 * No DB required — pure WebCrypto operations.
 */

import { describe, expect, test, } from "bun:test";
import {
  deriveSharedSecret,
  exportPrivateJwk,
  exportPublicJwk,
  generateKeyPair,
  importKeyPair,
  importPrivateKey,
  importPublicKey,
} from "./key-pairs";

describe("ECDH key pair generation", () => {
  test("generates a usable key pair (extractable by default)", async () => {
    const pair = await generateKeyPair();
    expect(pair.publicKey,).toBeInstanceOf(CryptoKey,);
    expect(pair.privateKey,).toBeInstanceOf(CryptoKey,);
    expect(pair.publicKey.algorithm.name,).toBe("ECDH",);
    expect(pair.privateKey.algorithm.name,).toBe("ECDH",);
  });

  test("public key JWK has expected EC fields", async () => {
    const pair = await generateKeyPair();
    const jwk = await exportPublicJwk(pair.publicKey,);
    expect(jwk.kty,).toBe("EC",);
    expect(jwk.crv,).toBe("P-256",);
    expect(typeof jwk.x,).toBe("string",);
    expect(typeof jwk.y,).toBe("string",);
    expect(jwk.d,).toBeUndefined(); // private scalar MUST NOT be on the public JWK
  });

  test("private key JWK includes the scalar `d`", async () => {
    const pair = await generateKeyPair({ extractable: true, },);
    const jwk = await exportPrivateJwk(pair.privateKey,);
    expect(jwk.d,).toBeDefined();
  });
});

describe("ECDH shared-secret derivation", () => {
  test("two parties derive the SAME session key (symmetric agreement)", async () => {
    const alicePair = await generateKeyPair();
    const bobPair = await generateKeyPair();

    // Alice uses HER private + BOB's public; Bob uses HIS private + ALICE's public.
    const aliceSession = await deriveSharedSecret({ privateKey: alicePair.privateKey, publicKey: bobPair.publicKey, },);
    const bobSession = await deriveSharedSecret({ privateKey: bobPair.privateKey, publicKey: alicePair.publicKey, },);

    // Round-trip: Alice encrypts with her session key, Bob decrypts with his.
    const plaintext = "hello bob";
    const iv = crypto.getRandomValues(new Uint8Array(12,),);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, },
      aliceSession,
      new TextEncoder().encode(plaintext,),
    );
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, }, bobSession, ciphertext,);
    expect(new TextDecoder().decode(decrypted,),).toBe(plaintext,);
  });

  test("a third party derives a DIFFERENT session key", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const eve = await generateKeyPair();

    const aliceBobKey = await deriveSharedSecret({ privateKey: alice.privateKey, publicKey: bob.publicKey, },);
    const eveBobKey = await deriveSharedSecret({ privateKey: eve.privateKey, publicKey: bob.publicKey, },);

    // Verify by encrypting with one, failing with the other.
    const iv = crypto.getRandomValues(new Uint8Array(12,),);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, }, aliceBobKey, new TextEncoder().encode("secret",),);
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv, }, eveBobKey, ct,),
    ).rejects.toThrow();
  });

  test("session key is non-extractable (cannot be exported)", async () => {
    const pair = await generateKeyPair();
    const session = await deriveSharedSecret({ privateKey: pair.privateKey, publicKey: pair.publicKey, },);
    expect(session.extractable,).toBe(false,);
  });
});

describe("Key pair import (JWK round-trip)", () => {
  test("imported key pair can derive the same shared secret as the original", async () => {
    const aliceOriginal = await generateKeyPair({ extractable: true, },);
    const bobOriginal = await generateKeyPair({ extractable: true, },);

    // Export Alice → re-import (non-extractable) → derive.
    const aliceJwk = {
      publicKey: await exportPublicJwk(aliceOriginal.publicKey,),
      privateKey: await exportPrivateJwk(aliceOriginal.privateKey,),
    };
    const aliceReimported = await importKeyPair(aliceJwk,);

    const original = await deriveSharedSecret({
      privateKey: aliceOriginal.privateKey,
      publicKey: bobOriginal.publicKey,
    },);
    const reimported = await deriveSharedSecret({
      privateKey: aliceReimported.privateKey,
      publicKey: bobOriginal.publicKey,
    },);

    const iv = crypto.getRandomValues(new Uint8Array(12,),);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, }, original, new TextEncoder().encode("payload",),);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, }, reimported, ct,);
    expect(new TextDecoder().decode(pt,),).toBe("payload",);
  });

  test("public-key-only import is non-extractable and useless for signing", async () => {
    const pair = await generateKeyPair();
    const pubJwk = await exportPublicJwk(pair.publicKey,);
    const importedPub = await importPublicKey(pubJwk,);
    expect(importedPub.extractable,).toBe(false,);
    // Public-only import must still work for ECDH derivation:
    const session = await deriveSharedSecret({ privateKey: pair.privateKey, publicKey: importedPub, },);
    expect(session,).toBeInstanceOf(CryptoKey,);
  });

  test("private-key import with extractable=false locks the key down", async () => {
    const pair = await generateKeyPair({ extractable: true, },);
    const privJwk = await exportPrivateJwk(pair.privateKey,);
    const lockedPriv = await importPrivateKey(privJwk, { extractable: false, },);
    expect(lockedPriv.extractable,).toBe(false,);
  });
});
