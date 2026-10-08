// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import { storageGet, storageRemove, storageSet, } from "./storage";

type StorageGlobals = { localStorage?: Storage; sessionStorage?: Storage };

/** Bun's DOM shim exposes these as readonly, so swap them by descriptor. */
function installStorage(name: "localStorage" | "sessionStorage", value: Storage | undefined,): void {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value, },);
}

/** A Storage that refuses every operation, as a blocked/quota-exceeded store does. */
function throwingStorage(error: string,): Storage {
  const boom = () => {
    throw new Error(error,);
  };

  return {
    getItem: boom,
    setItem: boom,
    removeItem: boom,
    clear: boom,
    key: boom,
    length: 0,
  } as unknown as Storage;
}

/** A working in-memory Storage. */
function memoryStorage(): Storage & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const stub = {
    store,
    getItem: (k: string,) => store.get(k,) ?? null,
    setItem: (k: string, v: string,) => {
      store.set(k, String(v,),);
    },
    removeItem: (k: string,) => {
      store.delete(k,);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };

  return stub as unknown as Storage & { store: Map<string, string> };
}

const original = {
  localStorage: (globalThis as StorageGlobals).localStorage,
  sessionStorage: (globalThis as StorageGlobals).sessionStorage,
};

afterEach(() => {
  installStorage("localStorage", original.localStorage,);
  installStorage("sessionStorage", original.sessionStorage,);
},);

describe("safe storage helpers", () => {
  test("read, write and delete round-trip through local storage", () => {
    const mem = memoryStorage();
    installStorage("localStorage", mem,);

    storageSet("local", "k", "v",);
    expect(mem.store.get("k",),).toBe("v",);
    expect(storageGet("local", "k",),).toBe("v",);

    storageRemove("local", "k",);
    expect(storageGet("local", "k",),).toBeNull();
  });

  test("a missing key reads as null, not a throw", () => {
    installStorage("localStorage", memoryStorage(),);
    expect(storageGet("local", "absent",),).toBeNull();
  });

  test("blocked storage (access throws) degrades to null / no-op", () => {
    // Reading the global itself throws — the private-window SecurityError.
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: access denied",);
      },
    },);

    expect(storageGet("local", "k",),).toBeNull();
    expect(() => storageSet("local", "k", "v",)).not.toThrow();
    expect(() => storageRemove("local", "k",)).not.toThrow();
  });

  test("quota-exceeded writes are reported, not thrown", () => {
    // The global resolves fine but setItem throws — the other failure mode.
    installStorage("localStorage", throwingStorage("QuotaExceededError",),);

    expect(() => storageSet("local", "k", "v",)).not.toThrow();
    expect(() => storageRemove("local", "k",)).not.toThrow();
    expect(storageGet("local", "k",),).toBeNull();
  });

  test("session storage is addressed independently of local", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    installStorage("localStorage", local,);
    installStorage("sessionStorage", session,);

    storageSet("session", "k", "s",);
    storageSet("local", "k", "l",);

    expect(session.store.get("k",),).toBe("s",);
    expect(local.store.get("k",),).toBe("l",);
    expect(storageGet("session", "k",),).toBe("s",);
  });

  test("blocked session storage also degrades instead of throwing", () => {
    installStorage("localStorage", memoryStorage(),);
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: access denied",);
      },
    },);

    expect(storageGet("session", "k",),).toBeNull();
    expect(() => storageSet("session", "k", "v",)).not.toThrow();
  });
});
