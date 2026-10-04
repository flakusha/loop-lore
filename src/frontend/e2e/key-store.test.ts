// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for e2e/key-store.ts: stored-shape validation guards,
 * per-actor namespacing, key rotation, and persist-failure tolerance.
 *
 * The module under test is imported dynamically: mock.module must be
 * registered before key-store.ts first loads (module-loading boundary).
 */
import { beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";

// ── localStorage shim (Bun test env has none) ──────────────

const store = new Map<string, string>();
let setItemThrows = false;

function installStorage(): void {
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string,) => (store.has(k,) ? (store.get(k,) as string) : null),
    setItem: (k: string, v: string,) => {
      if (setItemThrows) {
        throw new Error("quota",);
      }

      store.set(k, v,);
    },
    removeItem: (k: string,) => {
      store.delete(k,);
    },
    key: (i: number,) => Array.from(store.keys(),)[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

// ── key-pairs mock ─────────────────────────────────────────

const importCalls: { jwks: unknown; opts: unknown }[] = [];
let generated = 0;

if (ISOLATED) {
  mock.module("../../crypto/e2e/key-pairs", () => ({
    generateKeyPair: async () => {
      generated += 1;
      return { publicKey: { pub: generated, }, privateKey: { priv: generated, }, };
    },
    exportPublicJwk: async (k: unknown,) => ({ exportedPub: k, }),
    exportPrivateJwk: async (k: unknown,) => ({ exportedPriv: k, }),
    importKeyPair: async (jwks: unknown, opts: unknown = {},) => {
      importCalls.push({ jwks, opts, },);
      const pair = jwks as { publicKey: unknown; privateKey: unknown };
      return { publicKey: pair.publicKey, privateKey: pair.privateKey, };
    },
    // Remaining key-pairs exports — stubbed so any other module in the
    // process that transitively imports the barrel keeps its full export set.
    importPublicKey: async (jwk: unknown,) => jwk,
    importPrivateKey: async (jwk: unknown,) => jwk,
    deriveSharedSecret: async () => {
      throw new Error("not implemented",);
    },
    deriveSharedBytes: async () => new Uint8Array(0,),
  }),);
}

const PREFIX = "ll-e2e-privkey-v1";

function validStored(actorId: string,): string {
  return JSON.stringify({
    actorId,
    keyPairJwk: { publicKey: { kty: "EC", }, privateKey: { d: "x", }, },
    algorithm: "ECDH-P256",
    createdAt: "2026-01-01T00:00:00.000Z",
  },);
}

function storedWith(patch: Record<string, unknown>,): string {
  return JSON.stringify({
    actorId: "a",
    keyPairJwk: { publicKey: { kty: "EC", }, privateKey: { d: "x", }, },
    algorithm: "ECDH-P256",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  },);
}

let keyStore: typeof import("./key-store");

beforeEach(async () => {
  store.clear();
  setItemThrows = false;
  importCalls.length = 0;
  generated = 0;
  installStorage();
  keyStore = await import("./key-store");
},);

// ── getStoredKeyPair ──────────────────────────────────────

describeOrSkip("getStoredKeyPair", () => {
  test("null when nothing is stored", () => {
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null on invalid JSON", () => {
    store.set(`${PREFIX}:a`, "{not json",);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null for non-object JSON", () => {
    store.set(`${PREFIX}:a`, "42",);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null for array JSON", () => {
    store.set(`${PREFIX}:a`, "[]",);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null when actorId is missing or not a string", () => {
    store.set(`${PREFIX}:a`, storedWith({ actorId: undefined, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
    store.set(`${PREFIX}:a`, storedWith({ actorId: 5, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null when algorithm is missing or not a string", () => {
    store.set(`${PREFIX}:a`, storedWith({ algorithm: undefined, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
    store.set(`${PREFIX}:a`, storedWith({ algorithm: 1, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null when createdAt is missing or not a string", () => {
    store.set(`${PREFIX}:a`, storedWith({ createdAt: undefined, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
    store.set(`${PREFIX}:a`, storedWith({ createdAt: 42, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null when keyPairJwk is missing or not an object", () => {
    store.set(`${PREFIX}:a`, storedWith({ keyPairJwk: undefined, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
    store.set(`${PREFIX}:a`, storedWith({ keyPairJwk: "nope", },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null when publicKey is missing or not an object", () => {
    store.set(`${PREFIX}:a`, storedWith({ keyPairJwk: { privateKey: { d: "x", }, }, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
    store.set(`${PREFIX}:a`, storedWith({ keyPairJwk: { publicKey: 1, privateKey: { d: "x", }, }, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("null when privateKey is missing or not an object", () => {
    store.set(`${PREFIX}:a`, storedWith({ keyPairJwk: { publicKey: { kty: "EC", }, }, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
    store.set(`${PREFIX}:a`, storedWith({ keyPairJwk: { publicKey: { kty: "EC", }, privateKey: null, }, },),);
    expect(keyStore.getStoredKeyPair("a",),).toBeNull();
  });

  test("returns the stored pair when valid", () => {
    store.set(`${PREFIX}:a`, validStored("a",),);
    const result = keyStore.getStoredKeyPair("a",);
    expect(result,).not.toBeNull();
    expect(result?.actorId,).toBe("a",);
    expect(result?.algorithm,).toBe("ECDH-P256",);
    expect(result?.createdAt,).toBe("2026-01-01T00:00:00.000Z",);
  });
},);

// ── deleteStoredKeyPair / listStoredActorIds ───────────────

describeOrSkip("deleteStoredKeyPair", () => {
  test("removes the persisted entry", () => {
    store.set(`${PREFIX}:a`, validStored("a",),);
    keyStore.deleteStoredKeyPair("a",);
    expect(store.has(`${PREFIX}:a`,),).toBe(false,);
  });
},);

describeOrSkip("listStoredActorIds", () => {
  test("empty when nothing is stored", () => {
    expect(keyStore.listStoredActorIds(),).toEqual([],);
  });

  test("ignores keys outside the per-actor namespace", () => {
    store.set("other-key", "1",);
    store.set("ll-e2e-privkey-v2:a", "1",);
    expect(keyStore.listStoredActorIds(),).toEqual([],);
  });

  test("lists every actor with a persisted pair", () => {
    store.set(`${PREFIX}:a`, validStored("a",),);
    store.set(`${PREFIX}:b`, validStored("b",),);
    store.set("unrelated", "1",);
    expect(keyStore.listStoredActorIds().sort(),).toEqual(["a", "b",],);
  });

  test("actor ids with slashes and unicode stay namespaced", () => {
    store.set(`${PREFIX}:a/b`, validStored("a/b",),);
    store.set(`${PREFIX}:café`, validStored("café",),);
    expect(keyStore.getStoredKeyPair("a/b",),).not.toBeNull();
    expect(keyStore.getStoredKeyPair("café",),).not.toBeNull();
    expect(keyStore.listStoredActorIds().sort(),).toEqual(["a/b", "café",],);
  });
},);

// ── loadOrCreateKeyPair ───────────────────────────────────

describeOrSkip("loadOrCreateKeyPair", () => {
  test("loads an existing pair without generating", async () => {
    store.set(`${PREFIX}:a`, validStored("a",),);
    const result = await keyStore.loadOrCreateKeyPair({ actorId: "a", },);
    expect(result.created,).toBe(false,);
    expect(generated,).toBe(0,);
    expect(importCalls.length,).toBe(1,);
    expect(result.publicKeyJwk,).toEqual({ kty: "EC", },);
    expect(result.cryptoKeyPair,).toEqual({
      publicKey: { kty: "EC", } as unknown as CryptoKey,
      privateKey: { d: "x", } as unknown as CryptoKey,
    },);
  });

  test("rotate generates a fresh pair even when one exists", async () => {
    store.set(`${PREFIX}:a`, validStored("a",),);
    const result = await keyStore.loadOrCreateKeyPair({ actorId: "a", rotate: true, },);
    expect(result.created,).toBe(true,);
    expect(generated,).toBe(1,);
    expect(store.has(`${PREFIX}:a`,),).toBe(true,);
  });

  test("creates and persists a new pair, re-imports non-extractable", async () => {
    const result = await keyStore.loadOrCreateKeyPair({ actorId: "new", },);
    expect(result.created,).toBe(true,);
    expect(generated,).toBe(1,);
    expect(store.has(`${PREFIX}:new`,),).toBe(true,);
    const stored = JSON.parse(store.get(`${PREFIX}:new`,) as string,) as Record<string, any>;
    expect(stored.actorId,).toBe("new",);
    expect(stored.algorithm,).toBe("ECDH-P256",);
    expect(Number.isNaN(Date.parse(stored.createdAt,),),).toBe(false,);
    expect(importCalls[0]?.opts,).toEqual({ extractablePrivate: false, },);
  });

  test("persist failure still returns a usable pair", async () => {
    setItemThrows = true;
    const result = await keyStore.loadOrCreateKeyPair({ actorId: "a", },);
    expect(result.created,).toBe(true,);
    expect(result.cryptoKeyPair,).not.toBeNull();
  });

  test("corrupt stored pair regenerates a fresh one", async () => {
    store.set(`${PREFIX}:a`, "{not json",);
    const result = await keyStore.loadOrCreateKeyPair({ actorId: "a", },);
    expect(result.created,).toBe(true,);
    expect(generated,).toBe(1,);
  });

  test("rotate with persist failure still returns a usable pair", async () => {
    setItemThrows = true;
    const result = await keyStore.loadOrCreateKeyPair({ actorId: "a", rotate: true, },);
    expect(result.created,).toBe(true,);
    expect(result.cryptoKeyPair,).not.toBeNull();
  });

  test("one actor's pair is never returned for another", async () => {
    store.set(`${PREFIX}:a`, validStored("a",),);
    const result = await keyStore.loadOrCreateKeyPair({ actorId: "b", },);
    expect(result.created,).toBe(true,);
    expect(generated,).toBe(1,);
  });
},);
