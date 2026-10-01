// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the htmx integration module — apiFetch delegation/logging and the
 * document-level event handlers (htmx lifecycle, asset/character/world events,
 * global Escape key).
 *
 * Strategy: no mock.module (siblings import this file; module mocks would leak
 * across test files). Instead each flow imports a fresh htmx.ts instance via a
 * query-busted dynamic import (module-loading boundary: fresh module state per
 * flow) after installing a capturing fake document and global listener
 * registry. The real feFetch/safeFetch chain runs against a stubbed
 * globalThis.fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi, } from "bun:test";

type Listener = (event: unknown,) => void;

type HtmxModule = {
  apiFetch: (
    url: string,
    options?: RequestInit & { idempotencyKey?: string | true; stream?: boolean },
  ) => Promise<Response>;
};

// ── Fake DOM ──────────────────────────────────────────────────────

class FakeClassList {
  private readonly classes = new Set<string>();
  add(...names: string[]): void {
    for (const name of names) { this.classes.add(name,); }
  }
  remove(...names: string[]): void {
    for (const name of names) { this.classes.delete(name,); }
  }
  contains(name: string,): boolean {
    return this.classes.has(name,);
  }
}

class FakeElement {
  readonly tagName: string;
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  attrs: Record<string, string> = {};
  dataset: Record<string, string> = {};
  textContent = "";
  focused = false;
  clicked = false;
  constructor(tag: string,) {
    this.tagName = tag.toUpperCase();
  }
  getAttribute(name: string,): string | null {
    return name in this.attrs ? (this.attrs[name] ?? null) : null;
  }
  setAttribute(name: string, value: string,): void {
    this.attrs[name] = value;
  }
  remove(): void {}
  contains(_other: unknown,): boolean {
    return false;
  }
  insertBefore(_node: FakeElement, _ref: FakeElement | null,): void {}
  focus(): void {
    this.focused = true;
  }
  click(): void {
    this.clicked = true;
  }
  scrollIntoView(): void {}
  getBoundingClientRect(): { top: number; left: number; bottom: number; right: number } {
    return { top: 0, left: 0, bottom: 10, right: 10, };
  }
}

const elements = new Map<string, FakeElement>();
const docListeners = new Map<string, Set<Listener>>();
const dispatched: { type: string; detail?: unknown }[] = [];

const fakeDocument = {
  title: "",
  cookie: "",
  activeElement: null as FakeElement | null,
  addEventListener(type: string, fn: Listener,): void {
    let set = docListeners.get(type,);
    if (!set) {
      set = new Set();
      docListeners.set(type, set,);
    }
    set.add(fn,);
  },
  removeEventListener(type: string, fn: Listener,): void {
    docListeners.get(type,)?.delete(fn,);
  },
  dispatchEvent(event: { type: string; detail?: unknown },): boolean {
    dispatched.push({ type: event.type, detail: event.detail, },);
    if (event.type === "show-toast") {
      const detail = event.detail as { type: string; message: string } | undefined;
      if (detail) {
        (globalObj.showToast as ((type: string, message: string,) => void) | undefined)?.(detail.type, detail.message,);
      }
    }
    return true;
  },
  querySelector(selector: string,): FakeElement | null {
    return elements.get(selector,) ?? null;
  },
  querySelectorAll(selector: string,): FakeElement[] {
    const el = elements.get(selector,);
    return el ? [el,] : [];
  },
};

// ── Global stubs ──────────────────────────────────────────────────

const globalListeners = new Map<string, Set<Listener>>();
const htmxCalls: { fn: string; args: unknown[] }[] = [];
const alpineCalls: { fn: string; args: unknown[] }[] = [];
const toasts: { type: string; message: string }[] = [];
let sidebarClosed = 0;
let fetchImpl: (url: string, init?: RequestInit,) => Promise<Response> = () =>
  Promise.resolve(new Response("ok", { status: 200, },),);
const fetchCalls: { url: string; init?: RequestInit }[] = [];
const locationAssigns: string[] = [];
const consoleInfo: unknown[][] = [];
const consoleDebug: unknown[][] = [];
const consoleError: unknown[][] = [];

const globalObj = globalThis as unknown as {
  addEventListener: (type: string, fn: Listener,) => void;
  htmx?: unknown;
  Alpine?: unknown;
  showToast?: unknown;
  closeSidebar?: unknown;
  fetch?: unknown;
  location?: unknown;
  apiFetch?: unknown;
};

const originalGlobalAdd = globalObj.addEventListener;
const originalDocument = globalThis.document;
const originalFetch = globalObj.fetch;
const originalHtmx = globalObj.htmx;
const originalAlpine = globalObj.Alpine;
const originalShowToast = globalObj.showToast;
const originalCloseSidebar = globalObj.closeSidebar;
const originalLocation = globalObj.location;
const originalConsoleInfo = console.info;
const originalConsoleDebug = console.debug;
const originalConsoleError = console.error;
const originalLocaleStrings = (globalThis as Record<string, unknown>).__localeStrings;

function fireDoc(type: string, detail?: unknown,): void {
  // Merge detail onto the event: CustomEvent handlers read e.detail, while
  // plain-event handlers (keydown) read e.key at the top level.
  const event = { type, detail, ...(detail && typeof detail === "object" ? detail : {}), } as unknown as Event;
  for (const fn of docListeners.get(type,) ?? []) {
    fn(event,);
  }
}

function fireGlobal(type: string, detail?: unknown,): void {
  const event = { type, detail, } as unknown as Event;
  for (const fn of globalListeners.get(type,) ?? []) {
    fn(event,);
  }
}

function lastToast(): { type: string; message: string } | undefined {
  return toasts[toasts.length - 1];
}

async function importHtmx(tag: string,): Promise<HtmxModule> {
  // Variable specifier: TS cannot type-check a literal with a query string.
  const spec = `./htmx.ts?fresh=${tag}`;
  return (await import(spec)) as HtmxModule;
}

/** Let queued logger output (100ms interval) reach the console spies. */
async function flushLogQueue(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  elements.clear();
  docListeners.clear();
  globalListeners.clear();
  dispatched.length = 0;
  htmxCalls.length = 0;
  alpineCalls.length = 0;
  toasts.length = 0;
  sidebarClosed = 0;
  fetchCalls.length = 0;
  fetchImpl = () => Promise.resolve(new Response("ok", { status: 200, },),);
  locationAssigns.length = 0;
  consoleInfo.length = 0;
  consoleDebug.length = 0;
  consoleError.length = 0;
  fakeDocument.title = "";
  fakeDocument.cookie = "";
  fakeDocument.activeElement = null;
  globalThis.document = fakeDocument as unknown as Document;
  globalObj.addEventListener = (type: string, fn: Listener,) => {
    let set = globalListeners.get(type,);
    if (!set) {
      set = new Set();
      globalListeners.set(type, set,);
    }
    set.add(fn,);
  };
  globalObj.htmx = {
    process: (...args: unknown[]) => {
      htmxCalls.push({ fn: "process", args, },);
    },
    ajax: (...args: unknown[]) => {
      htmxCalls.push({ fn: "ajax", args, },);
    },
    trigger: (...args: unknown[]) => {
      htmxCalls.push({ fn: "trigger", args, },);
    },
  };
  globalObj.Alpine = {
    store: () => ({}),
    initTree: (...args: unknown[]) => {
      alpineCalls.push({ fn: "initTree", args, },);
    },
  };
  globalObj.showToast = (type: string, message: string,) => {
    toasts.push({ type, message, },);
  };
  globalObj.closeSidebar = () => {
    sidebarClosed += 1;
  };
  globalObj.fetch = (url: string, init?: RequestInit,) => {
    fetchCalls.push({ url, init, },);
    return fetchImpl(url, init,);
  };
  globalObj.location = {
    pathname: "/chat",
    search: "",
    assign: (url: string,) => {
      locationAssigns.push(url,);
    },
  };
  console.info = (...args: unknown[]) => {
    consoleInfo.push(args,);
  };
  console.debug = (...args: unknown[]) => {
    consoleDebug.push(args,);
  };
  console.error = (...args: unknown[]) => {
    consoleError.push(args,);
  };
},);

afterEach(() => {
  globalObj.addEventListener = originalGlobalAdd;
  globalThis.document = originalDocument;
  globalObj.fetch = originalFetch;
  globalObj.htmx = originalHtmx;
  globalObj.Alpine = originalAlpine;
  globalObj.showToast = originalShowToast;
  globalObj.closeSidebar = originalCloseSidebar;
  globalObj.location = originalLocation;
  console.info = originalConsoleInfo;
  console.debug = originalConsoleDebug;
  console.error = originalConsoleError;
  (globalThis as Record<string, unknown>).__localeStrings = originalLocaleStrings;
  vi.useRealTimers();
},);

// ── apiFetch ──────────────────────────────────────────────────────

describe("apiFetch", () => {
  it("delegates to feFetch and returns its Response", async () => {
    const mod = await importHtmx("apifetch-basic",);
    const res = await mod.apiFetch("/api/x",);
    expect(fetchCalls.length,).toBe(1,);
    expect(fetchCalls[0]?.url,).toBe("/api/x",);
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("ok",);
  });

  it("defaults to GET when no method is given", async () => {
    const mod = await importHtmx("apifetch-get",);
    await mod.apiFetch("/api/x",);
    expect(new Request(`https://localhost${fetchCalls[0]?.url ?? ""}`, fetchCalls[0]?.init,).method,).toBe("GET",);
  });

  it("forwards a custom method and body", async () => {
    const mod = await importHtmx("apifetch-post",);
    await mod.apiFetch("/api/x", { method: "POST", body: "payload", },);
    const init = fetchCalls[0]?.init as RequestInit;
    expect(init?.method,).toBe("POST",);
    expect(init?.body,).toBe("payload",);
  });

  it("injects the CSRF header from the cookie", async () => {
    fakeDocument.cookie = "csrf_token=abc123; other=1";
    const mod = await importHtmx("apifetch-csrf",);
    await mod.apiFetch("/api/x",);
    const headers = (fetchCalls[0]?.init as RequestInit)?.headers as Headers;
    expect(headers.get("X-CSRF-Token",),).toBe("abc123",);
  });

  it("omits the CSRF header when the cookie is absent", async () => {
    const mod = await importHtmx("apifetch-no-csrf",);
    await mod.apiFetch("/api/x",);
    const headers = (fetchCalls[0]?.init as RequestInit)?.headers as Headers;
    expect(headers.get("X-CSRF-Token",),).toBeNull();
  });

  it("generates an Idempotency-Key when idempotencyKey is true", async () => {
    const mod = await importHtmx("apifetch-idem-true",);
    await mod.apiFetch("/api/x", { idempotencyKey: true, },);
    const headers = (fetchCalls[0]?.init as RequestInit)?.headers as Headers;
    const key = headers.get("Idempotency-Key",);
    expect(typeof key,).toBe("string",);
    expect(key!.length,).toBeGreaterThan(0,);
  });

  it("uses a custom idempotencyKey string verbatim", async () => {
    const mod = await importHtmx("apifetch-idem-custom",);
    await mod.apiFetch("/api/x", { idempotencyKey: "my-key", },);
    const headers = (fetchCalls[0]?.init as RequestInit)?.headers as Headers;
    expect(headers.get("Idempotency-Key",),).toBe("my-key",);
  });

  it("omits the Idempotency-Key when idempotencyKey is empty", async () => {
    const mod = await importHtmx("apifetch-idem-empty",);
    await mod.apiFetch("/api/x", { idempotencyKey: "", },);
    const headers = (fetchCalls[0]?.init as RequestInit)?.headers as Headers;
    expect(headers.get("Idempotency-Key",),).toBeNull();
  });

  it("rejects with the status attached on a 500", async () => {
    fetchImpl = () => Promise.resolve(new Response("err", { status: 500, },),);
    const mod = await importHtmx("apifetch-500",);
    const err = await mod.apiFetch("/api/x",).catch((e: unknown,) => e) as Error & { status?: number };
    expect(err.status,).toBe(500,);
  });

  it("rejects with Unauthorized and redirects on a 401", async () => {
    fetchImpl = () => Promise.resolve(new Response("no", { status: 401, },),);
    const mod = await importHtmx("apifetch-401",);
    const err = await mod.apiFetch("/api/x",).catch((e: unknown,) => e) as Error;
    expect(err.message,).toBe("Unauthorized",);
    expect(locationAssigns.length,).toBeGreaterThan(0,);
    expect(locationAssigns[0],).toContain("/views/login?redirect=",);
  });

  it("does not redirect to login when already on the login page", async () => {
    fetchImpl = () => Promise.resolve(new Response("no", { status: 401, },),);
    globalObj.location = {
      pathname: "/views/login",
      search: "",
      assign: (url: string,) => {
        locationAssigns.push(url,);
      },
    };
    const mod = await importHtmx("apifetch-401-login-page",);
    await mod.apiFetch("/api/x",).catch(() => {},);
    expect(locationAssigns.length,).toBe(0,);
  });

  it("logs request and response lines through the api logger", async () => {
    vi.useFakeTimers();
    const mod = await importHtmx("apifetch-logs",);
    await mod.apiFetch("/api/x",);
    vi.advanceTimersByTime(100,);
    await flushLogQueue();
    const requestLog = consoleInfo.find((args,) => String(args[0],).includes("GET /api/x",));
    const responseLog = consoleInfo.find((args,) => String(args[0],).includes("200 /api/x",));
    expect(requestLog,).toBeDefined();
    expect(responseLog,).toBeDefined();
  });
});

// ── htmx:configRequest ───────────────────────────────────────────

describe("htmx:configRequest", () => {
  it("adds the X-CSRF-Token header from the cookie", async () => {
    fakeDocument.cookie = "csrf_token=token-9";
    await importHtmx("configrequest-csrf",);
    const headers: Record<string, string> = {};
    fireDoc("htmx:configRequest", { headers, },);
    expect(headers["X-CSRF-Token"],).toBe("token-9",);
  });

  it("leaves headers untouched when no CSRF cookie exists", async () => {
    await importHtmx("configrequest-no-csrf",);
    const headers: Record<string, string> = {};
    fireDoc("htmx:configRequest", { headers, },);
    expect("X-CSRF-Token" in headers,).toBe(false,);
  });
});

// ── htmx:load ────────────────────────────────────────────────────

describe("htmx:load", () => {
  it("processes the element with htmx and initializes Alpine", async () => {
    await importHtmx("load-basic",);
    const elt = new FakeElement("div",);
    fireDoc("htmx:load", { elt, },);
    expect(htmxCalls.some((c,) => c.fn === "process"),).toBe(true,);
    expect(alpineCalls.some((c,) => c.fn === "initTree"),).toBe(true,);
  });

  it("skips htmx/Alpine when the globals are missing", async () => {
    await importHtmx("load-no-globals",);
    const savedHtmx = globalObj.htmx;
    const savedAlpine = globalObj.Alpine;
    globalObj.htmx = undefined;
    globalObj.Alpine = undefined;
    const elt = new FakeElement("div",);
    fireDoc("htmx:load", { elt, },);
    expect(htmxCalls.length,).toBe(0,);
    expect(alpineCalls.length,).toBe(0,);
    globalObj.htmx = savedHtmx;
    globalObj.Alpine = savedAlpine;
  });

  it("survives Alpine.initTree throwing", async () => {
    await importHtmx("load-alpine-throws",);
    const savedAlpine = globalObj.Alpine;
    globalObj.Alpine = {
      store: () => ({}),
      initTree: () => {
        throw new Error("alpine boom",);
      },
    };
    const elt = new FakeElement("div",);
    expect(() => fireDoc("htmx:load", { elt, },)).not.toThrow();
    globalObj.Alpine = savedAlpine;
  });

  it("handles a missing element detail", async () => {
    await importHtmx("load-no-elt",);
    fireDoc("htmx:load", {},);
    expect(htmxCalls.length,).toBe(0,);
    expect(alpineCalls.length,).toBe(0,);
  });

  it("triggers the create-chat page loader when #create-chat-form exists", async () => {
    await importHtmx("load-pageloader",);
    const loaderCalls: string[] = [];
    (globalThis as Record<string, unknown>)["loadNewChatPage"] = () => {
      loaderCalls.push("loadNewChatPage",);
    };
    elements.set("#create-chat-form", new FakeElement("form",),);
    fireDoc("htmx:load", { elt: new FakeElement("div",), },);
    expect(loaderCalls,).toEqual(["loadNewChatPage",],);
    delete (globalThis as Record<string, unknown>)["loadNewChatPage"];
  });

  it("does not trigger the page loader when the form is absent", async () => {
    await importHtmx("load-pageloader-absent",);
    const loaderCalls: string[] = [];
    (globalThis as Record<string, unknown>)["loadNewChatPage"] = () => {
      loaderCalls.push("loadNewChatPage",);
    };
    fireDoc("htmx:load", { elt: new FakeElement("div",), },);
    expect(loaderCalls.length,).toBe(0,);
    delete (globalThis as Record<string, unknown>)["loadNewChatPage"];
  });
});

// ── htmx:afterSwap (title sync) ──────────────────────────────────

describe("htmx:afterSwap", () => {
  it("updates the document title from the header slot", async () => {
    await importHtmx("afterswap-title",);
    const title = new FakeElement("h1",);
    title.textContent = "  Chat List  ";
    elements.set("#header-slot .title", title,);
    fireDoc("htmx:afterSwap", { target: new FakeElement("div",), },);
    expect(fakeDocument.title,).toBe("Chat List — Loop Lore",);
  });

  it("leaves the title alone when the header slot is empty", async () => {
    await importHtmx("afterswap-empty-title",);
    const title = new FakeElement("h1",);
    title.textContent = "   ";
    elements.set("#header-slot .title", title,);
    fireDoc("htmx:afterSwap", { target: new FakeElement("div",), },);
    expect(fakeDocument.title,).toBe("",);
  });

  it("leaves the title alone when the header slot is missing", async () => {
    await importHtmx("afterswap-no-header",);
    fireDoc("htmx:afterSwap", { target: new FakeElement("div",), },);
    expect(fakeDocument.title,).toBe("",);
  });

  it("ignores events without a target", async () => {
    await importHtmx("afterswap-no-target",);
    const title = new FakeElement("h1",);
    title.textContent = "Chat";
    elements.set("#header-slot .title", title,);
    fireDoc("htmx:afterSwap", {},);
    expect(fakeDocument.title,).toBe("",);
  });
});

// ── htmx:responseError ───────────────────────────────────────────

describe("htmx:responseError", () => {
  it("shows the server error message as a toast", async () => {
    await importHtmx("responseerror-json",);
    fireDoc("htmx:responseError", {
      xhr: { responseText: JSON.stringify({ error: "bad thing", },), status: 400, },
    },);
    expect(lastToast()?.type,).toBe("error",);
    expect(lastToast()?.message,).toBe("bad thing",);
  });

  it("falls back to the status code when the body has no error field", async () => {
    await importHtmx("responseerror-nomsg",);
    fireDoc("htmx:responseError", {
      xhr: { responseText: JSON.stringify({ other: 1, },), status: 500, },
    },);
    expect(lastToast()?.message,).toBe("Error 500",);
  });

  it("falls back to the status code when the body is not JSON", async () => {
    await importHtmx("responseerror-badjson",);
    fireDoc("htmx:responseError", {
      xhr: { responseText: "<html>oops</html>", status: 502, },
    },);
    expect(lastToast()?.message,).toBe("Error 502",);
  });

  it("ignores events without an xhr", async () => {
    await importHtmx("responseerror-no-xhr",);
    fireDoc("htmx:responseError", {},);
    expect(toasts.length,).toBe(0,);
  });
});

// ── htmx:afterRequest (hx-on::after-request replacements) ────────

describe("htmx:afterRequest", () => {
  it("dispatches the element's hx-success-event on success", async () => {
    await importHtmx("afterrequest-success",);
    const elt = new FakeElement("button",);
    elt.dataset.hxSuccessEvent = "my:done";
    fireDoc("htmx:afterRequest", { successful: true, elt, },);
    expect(dispatched.some((e,) => e.type === "my:done"),).toBe(true,);
  });

  it("does nothing when the request failed", async () => {
    await importHtmx("afterrequest-failure",);
    const elt = new FakeElement("button",);
    elt.dataset.hxSuccessEvent = "my:done";
    fireDoc("htmx:afterRequest", { successful: false, elt, },);
    expect(dispatched.length,).toBe(0,);
  });

  it("does nothing when the element has no hx-success-event", async () => {
    await importHtmx("afterrequest-no-event",);
    const elt = new FakeElement("button",);
    fireDoc("htmx:afterRequest", { successful: true, elt, },);
    expect(dispatched.length,).toBe(0,);
  });
});

// ── asset / character / world events ─────────────────────────────

describe("asset:uploaded", () => {
  it("closes the upload modal, toasts, and refreshes the grid", async () => {
    await importHtmx("asset-uploaded",);
    const modal = new FakeElement("div",);
    modal.classList.add("open",);
    elements.set("#upload-modal", modal,);
    const grid = new FakeElement("div",);
    grid.setAttribute("hx-get", "/api/asset-grid",);
    elements.set("#asset-grid", grid,);
    fireDoc("asset:uploaded",);
    expect(modal.classList.contains("open",),).toBe(false,);
    expect(lastToast()?.type,).toBe("success",);
    expect(htmxCalls.some((c,) => c.fn === "ajax"),).toBe(true,);
  });

  it("tolerates a missing modal and missing grid", async () => {
    await importHtmx("asset-uploaded-missing",);
    expect(() => fireDoc("asset:uploaded",)).not.toThrow();
    expect(lastToast()?.type,).toBe("success",);
    expect(htmxCalls.length,).toBe(0,);
  });
});

describe("asset:duplicate", () => {
  it("closes the modal and toasts with the filename", async () => {
    (globalThis as Record<string, unknown>).__localeStrings = {
      toasts: { assetAlreadyExists: "File {filename} already exists", },
    };
    await importHtmx("asset-duplicate",);
    const modal = new FakeElement("div",);
    modal.classList.add("open",);
    elements.set("#upload-modal", modal,);
    const grid = new FakeElement("div",);
    elements.set("#asset-grid", grid,);
    fireDoc("asset:duplicate", { filename: "hero.png", },);
    expect(modal.classList.contains("open",),).toBe(false,);
    expect(lastToast()?.type,).toBe("warning",);
    expect(lastToast()?.message,).toContain("hero.png",);
    expect(htmxCalls.some((c,) => c.fn === "trigger"),).toBe(true,);
  });

  it("uses the fallback filename when detail is missing", async () => {
    await importHtmx("asset-duplicate-fallback",);
    fireDoc("asset:duplicate", {},);
    expect(lastToast()?.type,).toBe("warning",);
    expect(typeof lastToast()?.message,).toBe("string",);
  });

  it("skips the htmx trigger when the grid is absent", async () => {
    await importHtmx("asset-duplicate-no-grid",);
    fireDoc("asset:duplicate", { filename: "a.png", },);
    expect(htmxCalls.length,).toBe(0,);
  });
});

describe("character:created", () => {
  it("toasts and refreshes the character grid", async () => {
    await importHtmx("character-created",);
    const grid = new FakeElement("div",);
    grid.setAttribute("hx-get", "/api/character-grid",);
    elements.set("#character-grid", grid,);
    fireDoc("character:created",);
    expect(lastToast()?.type,).toBe("success",);
    expect(htmxCalls.some((c,) => c.fn === "ajax"),).toBe(true,);
  });

  it("tolerates a missing grid", async () => {
    await importHtmx("character-created-missing",);
    expect(() => fireDoc("character:created",)).not.toThrow();
    expect(htmxCalls.length,).toBe(0,);
  });
});

describe("character:imported", () => {
  it("closes the import modal, toasts, and refreshes the grid", async () => {
    await importHtmx("character-imported",);
    const modal = new FakeElement("div",);
    modal.classList.add("open",);
    elements.set("#import-modal", modal,);
    const grid = new FakeElement("div",);
    grid.setAttribute("hx-get", "/api/character-grid",);
    elements.set("#character-grid", grid,);
    fireDoc("character:imported",);
    expect(modal.classList.contains("open",),).toBe(false,);
    expect(lastToast()?.type,).toBe("success",);
    expect(htmxCalls.some((c,) => c.fn === "ajax"),).toBe(true,);
  });

  it("tolerates a missing modal and grid", async () => {
    await importHtmx("character-imported-missing",);
    expect(() => fireDoc("character:imported",)).not.toThrow();
  });
});

describe("world:saved", () => {
  it("closes the edit-world modal, toasts, and refreshes the detail", async () => {
    await importHtmx("world-saved",);
    const modal = new FakeElement("div",);
    modal.classList.add("open",);
    elements.set("#edit-world-modal", modal,);
    const detail = new FakeElement("div",);
    detail.setAttribute("hx-get", "/api/world-detail",);
    elements.set("#world-detail", detail,);
    fireDoc("world:saved",);
    expect(modal.classList.contains("open",),).toBe(false,);
    expect(lastToast()?.type,).toBe("success",);
    expect(htmxCalls.some((c,) => c.fn === "ajax"),).toBe(true,);
  });

  it("tolerates a missing modal and detail", async () => {
    await importHtmx("world-saved-missing",);
    expect(() => fireDoc("world:saved",)).not.toThrow();
  });
});

// ── Global keyboard: Escape closes sidebar ───────────────────────

describe("keydown (Escape)", () => {
  it("closes the sidebar when it is open", async () => {
    await importHtmx("escape-open",);
    const sidebar = new FakeElement("aside",);
    sidebar.classList.add("open",);
    elements.set("#layout-sidebar", sidebar,);
    fireDoc("keydown", { key: "Escape", },);
    expect(sidebarClosed,).toBe(1,);
  });

  it("does nothing when the sidebar is closed", async () => {
    await importHtmx("escape-closed",);
    const sidebar = new FakeElement("aside",);
    elements.set("#layout-sidebar", sidebar,);
    fireDoc("keydown", { key: "Escape", },);
    expect(sidebarClosed,).toBe(0,);
  });

  it("does nothing when the sidebar element is missing", async () => {
    await importHtmx("escape-no-sidebar",);
    fireGlobal("keydown", { key: "Escape", },);
    expect(sidebarClosed,).toBe(0,);
  });

  it("ignores non-Escape keys", async () => {
    await importHtmx("escape-other-key",);
    const sidebar = new FakeElement("aside",);
    sidebar.classList.add("open",);
    elements.set("#layout-sidebar", sidebar,);
    fireGlobal("keydown", { key: "Enter", },);
    expect(sidebarClosed,).toBe(0,);
  });
});

// ── Global error capture ─────────────────────────────────────────

describe("global error listener", () => {
  it("logs uncaught errors", async () => {
    vi.useFakeTimers();
    await importHtmx("global-error",);
    fireGlobal("error", { message: "boom", filename: "app.js", lineno: 3, colno: 7, },);
    vi.advanceTimersByTime(100,);
    await flushLogQueue();
    expect(consoleError.length,).toBeGreaterThan(0,);
  });
});
