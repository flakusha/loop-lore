/**
 * End-to-end test for the client-side E2E encrypt/decrypt roundtrip.
 *
 * Stubs out the HTTP recipient-pubkey lookup so this test runs in pure
 * Node without a server. Both Alice and Bob persist their key pairs to
 * the localStorage shim so `loadOrCreateKeyPair` finds them at decrypt
 * time (matching the production flow).
 */

import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import {
  exportPrivateJwk,
  exportPublicJwk,
  generateKeyPair,
  importKeyPair,
  importPublicKey,
} from "../../crypto/e2e/key-pairs";
import { decryptMessage, } from "./decrypt-message";
import { type EncryptedPayload, encryptMessage, } from "./encrypt-message";

// ── Stub the recipient-pubkey HTTP layer ────────────────

const pubKeyRegistry = new Map<string, JsonWebKey>();

const originalFetch = globalThis.fetch;

const stubbedFetch = mock(async (input: RequestInfo | URL,) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const match = url.match(/\/api\/actors\/([^/]+)\/e2e-public-key/,);
  if (!match) {
    return new Response("not found", { status: 404, },);
  }
  const actorId = match[1]!;
  const jwk = pubKeyRegistry.get(actorId,);
  if (!jwk) {
    return new Response(JSON.stringify({ error: "not found", },), {
      status: 404,
      headers: { "content-type": "application/json", },
    },);
  }
  return new Response(JSON.stringify({ publicKeyJwk: jwk, },), {
    status: 200,
    headers: { "content-type": "application/json", },
  },);
},);

beforeEach(() => {
  pubKeyRegistry.clear();
  globalThis.fetch = stubbedFetch as unknown as typeof fetch;
  localStorage.clear();
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
  localStorage.clear();
},);

// ── localStorage shim (Bun test env has none) ─────────────

if (typeof localStorage === "undefined") {
  const storage = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string,) => storage.get(key,) ?? null,
    setItem: (key: string, value: string,) => storage.set(key, value,),
    removeItem: (key: string,) => storage.delete(key,),
    clear: () => storage.clear(),
    key: (i: number,) => Array.from(storage.keys(),)[i] ?? null,
    get length() {
      return storage.size;
    },
  } as Storage;
}

// ── Helpers ──────────────────────────────────────────────

/**
 * @param actorId
 */
async function persistKeyPair(actorId: string,): Promise<JsonWebKey> {
  const pair = await generateKeyPair({ extractable: true, },);
  const pubJwk = await exportPublicJwk(pair.publicKey,);
  const privJwk = await exportPrivateJwk(pair.privateKey,);
  localStorage.setItem(
    `ll-e2e-privkey-v1:${actorId}`,
    JSON.stringify({
      actorId,
      keyPairJwk: { publicKey: pubJwk, privateKey: privJwk, },
      algorithm: "ECDH-P256",
      createdAt: new Date().toISOString(),
    },),
  );
  return pubJwk;
}

/**
 * @param actorId
 */
function loadStoredJwkPair(actorId: string,): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  const raw = localStorage.getItem(`ll-e2e-privkey-v1:${actorId}`,);
  if (!raw) { throw new Error(`no stored key for ${actorId}`,); }
  const parsed = JSON.parse(raw,) as { keyPairJwk: { publicKey: JsonWebKey; privateKey: JsonWebKey } };
  return parsed.keyPairJwk;
}

/**
 * @param localPriv
 * @param peerPub
 */
async function rawSharedBytes(localPriv: CryptoKey, peerPub: CryptoKey,): Promise<Uint8Array> {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPub, }, localPriv, 256,);
  return new Uint8Array(bits,);
}

// ── Tests ────────────────────────────────────────────────

describe("E2E encrypt/decrypt roundtrip", () => {
  test("Alice encrypts → Bob decrypts (one-shot chain step)", async () => {
    // Both parties persist their key pairs so the decrypt path's
    // loadOrCreateKeyPair call finds them.
    const alicePub = await persistKeyPair("alice-a",);
    const bobPub = await persistKeyPair("bob-b",);
    pubKeyRegistry.set("bob-b", bobPub,);

    const aliceStored = loadStoredJwkPair("alice-a",);
    const bobStored = loadStoredJwkPair("bob-b",);
    const aliceLoaded = await importKeyPair(aliceStored,);
    const bobLoaded = await importKeyPair(bobStored,);

    const bobImported = await importPublicKey(bobPub,);
    const aliceImported = await importPublicKey(alicePub,);

    // Both sides derive the same starting chain key from raw ECDH bytes.
    const chainKeyAlice = await rawSharedBytes(aliceLoaded.privateKey, bobImported,);
    const chainKeyBob = await rawSharedBytes(bobLoaded.privateKey, aliceImported,);
    expect(chainKeyAlice,).toEqual(chainKeyBob,);

    // Alice encrypts.
    const payload: EncryptedPayload = await encryptMessage({
      senderActorId: "alice-a",
      recipientActorId: "bob-b",
      chainKey: chainKeyAlice,
      plaintext: "hello bob, this is end-to-end",
    },);

    // Bob decrypts.
    const decrypted = await decryptMessage({
      recipientActorId: "bob-b",
      chainKey: chainKeyBob,
      payload,
    },);

    expect(decrypted.plaintext,).toBe("hello bob, this is end-to-end",);
    expect(decrypted.nextChainKey.byteLength,).toBe(32,);
    expect(decrypted.nextChainKey,).not.toEqual(chainKeyBob,);
  });

  test("throws when recipient has no registered public key", async () => {
    await persistKeyPair("alice-a",);

    const chainKey = new Uint8Array(32,);
    await expect(
      encryptMessage({
        senderActorId: "alice-a",
        recipientActorId: "bob-without-key",
        chainKey,
        plaintext: "will fail",
      },),
    ).rejects.toThrow(/no active E2E public key/,);
  });

  test("tamper detection: flipping a ciphertext byte throws on decrypt", async () => {
    const bobPub = await persistKeyPair("bob-b",);
    await persistKeyPair("alice-a",);
    pubKeyRegistry.set("bob-b", bobPub,);

    const aliceStored = loadStoredJwkPair("alice-a",);
    const bobStored = loadStoredJwkPair("bob-b",);
    const aliceLoaded = await importKeyPair(aliceStored,);
    const bobLoaded = await importKeyPair(bobStored,);

    const bobImported = await importPublicKey(bobPub,);
    const aliceImported = await importPublicKey(aliceStored.publicKey,);

    const chainKeyAlice = await rawSharedBytes(aliceLoaded.privateKey, bobImported,);
    const chainKeyBob = await rawSharedBytes(bobLoaded.privateKey, aliceImported,);

    const payload = await encryptMessage({
      senderActorId: "alice-a",
      recipientActorId: "bob-b",
      chainKey: chainKeyAlice,
      plaintext: "secret",
    },);

    const tamperedCtBytes = Uint8Array.fromBase64(payload.ciphertext,);
    tamperedCtBytes[0] = (tamperedCtBytes[0] ?? 0) ^ 0x01;
    const tamperedPayload: EncryptedPayload = {
      ...payload,
      ciphertext: tamperedCtBytes.toBase64(),
    };

    await expect(
      decryptMessage({
        recipientActorId: "bob-b",
        chainKey: chainKeyBob,
        payload: tamperedPayload,
      },),
    ).rejects.toThrow();
  });
});
