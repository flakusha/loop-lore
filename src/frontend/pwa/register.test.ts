// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Service-worker registration guard (slice 1): no-ops without the SW API,
 * binds a load listener with it. Observable effects only — the module
 * self-registers on import via a globalThis load listener, so the test
 * observes the binding rather than driving a real registration.
 */
import { describe, expect, test, } from "bun:test";

type LoadFn = (...args: never[]) => void;

/** Stub `navigator` (optionally with a service worker) and capture load binds. */
function stubEnv(serviceWorker: boolean, bound: LoadFn[],): void {
  Object.defineProperty(globalThis, "navigator", {
    value: serviceWorker ? { serviceWorker: { register: () => Promise.resolve({},), }, } : {},
    configurable: true,
    writable: true,
  },);

  (globalThis as unknown as Record<string, unknown>).addEventListener = (type: string, fn: LoadFn,) => {
    if (type === "load") { bound.push(fn,); }
  };
}

describe("registerServiceWorker", () => {
  test("without the serviceWorker API nothing binds to load", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator",);
    const originalAdd = globalThis.addEventListener;
    const bound: LoadFn[] = [];
    stubEnv(false, bound,);
    try {
      const mod = await import("./register");
      mod.registerServiceWorker();
      expect(bound,).toEqual([],);
    } finally {
      globalThis.addEventListener = originalAdd;
      if (originalNavigator) {
        Object.defineProperty(globalThis, "navigator", originalNavigator,);
      } else {
        delete (globalThis as unknown as Record<string, unknown>).navigator;
      }
    }
  });

  test("with the serviceWorker API binds one load listener", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator",);
    const originalAdd = globalThis.addEventListener;
    const bound: LoadFn[] = [];
    stubEnv(true, bound,);
    try {
      const mod = await import("./register");
      mod.registerServiceWorker();
      expect(bound,).toHaveLength(1,);
    } finally {
      globalThis.addEventListener = originalAdd;
      if (originalNavigator) {
        Object.defineProperty(globalThis, "navigator", originalNavigator,);
      } else {
        delete (globalThis as unknown as Record<string, unknown>).navigator;
      }
    }
  });
});
