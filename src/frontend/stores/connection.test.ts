// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Connection store wiring — online/offline detection, the outbox enqueue
 * and drain signals, and the connectivity listeners (TASK-pwa-cached-shell-
 * plus-send-queue slices 2-3).
 *
 * Observable effects only: the events dispatched on `document`, the listeners
 * bound on `window` / `navigator.serviceWorker`, the Alpine store flag, and
 * promise resolution. Storage persistence is NOT asserted — the module
 * singleton is built over `localStorage`, which the test environment does not
 * provide, so the store is inert by construction.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import {
  drainOutbox,
  enqueueOutboxSend,
  isOffline,
  OUTBOX_CHANGED_EVENT,
  OUTBOX_DELIVERED_EVENT,
  watchConnection,
} from "./connection";
import { connectionStoreDefinition, } from "./connection-store";

type Listener = (event: Event,) => void;

interface Dispatched {
  type: string;
  detail: unknown;
}

const GLOBAL_KEYS = ["document", "window", "navigator", "Alpine",] as const;
const savedDescriptors = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  for (const key of GLOBAL_KEYS) {
    savedDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key,),);
  }
},);

afterEach(() => {
  for (const key of GLOBAL_KEYS) {
    const descriptor = savedDescriptors.get(key,);
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor,);
    } else {
      delete (globalThis as unknown as Record<string, unknown>)[key];
    }
  }

  savedDescriptors.clear();
},);

/** Install a `document` stub that records every dispatched event. */
function installDocument(dispatched: Dispatched[], onDispatch?: (type: string,) => void,): void {
  Object.defineProperty(globalThis, "document", {
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: (event: Event,) => {
        dispatched.push({ type: event.type, detail: (event as CustomEvent<unknown>).detail, },);
        onDispatch?.(event.type,);
        return true;
      },
      querySelector: () => null,
    },
    configurable: true,
    writable: true,
  },);
}

/** Install a `window` stub that records the listeners bound by type. */
function installWindow(listeners: Map<string, Listener[]>,): void {
  Object.defineProperty(globalThis, "window", {
    value: {
      addEventListener: (type: string, fn: Listener,) => {
        const bound = listeners.get(type,) ?? [];
        bound.push(fn,);
        listeners.set(type, bound,);
      },
    },
    configurable: true,
    writable: true,
  },);
}

/** Install a `navigator` stub (optionally with a service worker). */
function installNavigator(
  onLine: boolean,
  serviceWorker?: { addEventListener: (type: string, fn: Listener,) => void },
): void {
  Object.defineProperty(globalThis, "navigator", {
    value: serviceWorker ? { onLine, serviceWorker, } : { onLine, },
    configurable: true,
    writable: true,
  },);
}

/** Install an Alpine stub whose `connection` store is observable. */
function installAlpine(store: Record<string, unknown>,): void {
  Object.defineProperty(globalThis, "Alpine", {
    value: { store: (name: string,) => store[name], initTree: () => {}, },
    configurable: true,
    writable: true,
  },);
}

describe("isOffline", () => {
  test("reports offline when the browser reports no network", () => {
    installNavigator(false,);

    expect(isOffline(),).toBe(true,);
  });

  test("reports online when the browser reports a connection", () => {
    installNavigator(true,);

    expect(isOffline(),).toBe(false,);
  });
});

describe("enqueueOutboxSend", () => {
  test("announces the queue change so the badge refreshes", () => {
    const dispatched: Dispatched[] = [];
    installDocument(dispatched,);

    enqueueOutboxSend({ chatId: "chat-1", idempotencyKey: "key-1", body: '{"content":"hi"}', },);

    expect(dispatched.map((event,) => event.type),).toEqual([OUTBOX_CHANGED_EVENT,],);
  });
});

describe("drainOutbox", () => {
  test("resolves and reports the queue state through the change event", async () => {
    const dispatched: Dispatched[] = [];
    installDocument(dispatched,);

    await drainOutbox();

    expect(dispatched.map((event,) => event.type),).toEqual([OUTBOX_CHANGED_EVENT,],);
  });

  test("names the event the chat layer listens on for delivered sends", () => {
    expect(OUTBOX_DELIVERED_EVENT,).toBe("ll-outbox:delivered",);
  });
});

describe("watchConnection", () => {
  test("binds the connectivity listeners and seeds the store flag", () => {
    const listeners = new Map<string, Listener[]>();
    const store: Record<string, unknown> = { connection: { offline: true, }, };
    installWindow(listeners,);
    installNavigator(true,);
    installAlpine(store,);

    watchConnection();

    expect(listeners.get("online",),).toHaveLength(1,);
    expect(listeners.get("offline",),).toHaveLength(1,);
    expect((store.connection as { offline: boolean }).offline,).toBe(false,);
  });

  test("flips the store flag on the offline and online events", () => {
    const listeners = new Map<string, Listener[]>();
    const store: Record<string, unknown> = { connection: { offline: false, }, };
    installWindow(listeners,);
    installNavigator(true,);
    installAlpine(store,);
    installDocument([],);

    watchConnection();
    listeners.get("offline",)?.[0]?.(new Event("offline",),);
    expect((store.connection as { offline: boolean }).offline,).toBe(true,);

    listeners.get("online",)?.[0]?.(new Event("online",),);
    expect((store.connection as { offline: boolean }).offline,).toBe(false,);
  });

  test("drains the queue when the service worker pings for connectivity", async () => {
    const listeners = new Map<string, Listener[]>();
    const swListeners = new Map<string, Listener[]>();
    const dispatched: Dispatched[] = [];
    const changed = Promise.withResolvers<void>();
    installWindow(listeners,);
    installNavigator(true, {
      addEventListener: (type: string, fn: Listener,) => {
        const bound = swListeners.get(type,) ?? [];
        bound.push(fn,);
        swListeners.set(type, bound,);
      },
    },);

    installAlpine({ connection: { offline: false, }, },);
    installDocument(dispatched, (type,) => {
      if (type === OUTBOX_CHANGED_EVENT) { changed.resolve(); }
    },);

    watchConnection();
    const message = new Event("message",);
    Object.defineProperty(message, "data", { value: { type: "ll-drain-outbox", }, },);
    swListeners.get("message",)?.[0]?.(message,);
    await changed.promise;

    expect(dispatched.map((event,) => event.type),).toContain(OUTBOX_CHANGED_EVENT,);
  });
});

describe("connectionStoreDefinition", () => {
  test("seeds the offline flag to false", () => {
    expect(connectionStoreDefinition.offline,).toBe(false,);
  });
});

describe("drainOutbox failure paths", () => {
  test("logs instead of rejecting when the change broadcast blows up", async () => {
    installDocument([], (type,) => {
      if (type === OUTBOX_CHANGED_EVENT) { throw new Error("boom",); }
    },);

    await drainOutbox();
  });

  test("watchConnection tolerates a missing Alpine store", () => {
    const listeners = new Map<string, Listener[]>();
    installWindow(listeners,);
    installNavigator(true,);
    delete (globalThis as unknown as Record<string, unknown>).Alpine;

    watchConnection();

    expect(listeners.get("online",),).toHaveLength(1,);
    expect(listeners.get("offline",),).toHaveLength(1,);
  });
});
