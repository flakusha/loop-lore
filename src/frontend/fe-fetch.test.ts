// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Edge-case tests for fe-fetch.ts: CSRF token resolution (meta tag vs
 * cookie), idempotency key minting, null-body status preservation
 * (204/205/304), 401 redirect loop guard, and error status attachment.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

type FetchOpts = Record<string, unknown>;

let calls: { url: string; opts: FetchOpts }[] = [];
let fetchImpl: (url: string, opts?: FetchOpts,) => Promise<Response> = async () =>
  new Response("ok", { status: 200, },);

const realFetch = globalThis.fetch;

// Real safeFetch: the global fetch stub installed in beforeEach drives
// the real safe-fetch path (timeout, header injection, 401 handling).
// ── browser global stubs ────────────────────────────────────

const realDoc = globalThis.document;
const realLoc = (globalThis as { location?: unknown }).location;

let metaContent: string | null = null;
let cookie = "";
let locAssigns: string[] = [];
let locPathname = "/views/chat";
let locSearch = "";

beforeEach(() => {
  calls = [];
  fetchImpl = async () => new Response("ok", { status: 200, },);
  metaContent = null;
  cookie = "";
  locAssigns = [];
  locPathname = "/views/chat";
  locSearch = "";
  (globalThis as { document: unknown }).document = {
    querySelector: (sel: string,) =>
      sel === 'meta[name="csrf-token"]' ? (metaContent === null ? null : { content: metaContent, }) : null,
    get cookie() {
      return cookie;
    },
  } as unknown as Document;

  (globalThis as { location: unknown }).location = {
    get pathname() {
      return locPathname;
    },
    get search() {
      return locSearch;
    },
    assign: (url: string,) => {
      locAssigns.push(url,);
    },
  };

  (globalThis as { fetch: unknown }).fetch = (url: string, opts?: FetchOpts,) => {
    calls.push({ url, opts: opts as FetchOpts, },);
    return fetchImpl(url, opts,);
  };
},);

afterEach(() => {
  (globalThis as { document: unknown }).document = realDoc;
  (globalThis as { location: unknown }).location = realLoc;
  (globalThis as { fetch: unknown }).fetch = realFetch;
},);

async function importFeFetch() {
  return (await import("./fe-fetch")) as typeof import("./fe-fetch");
}

// ── getCsrfToken ────────────────────────────────────────────

describe("getCsrfToken", () => {
  test("prefers meta csrf-token content over cookie", async () => {
    metaContent = "meta-tok";
    cookie = "csrf_token=cookie-tok";
    const { feFetch, } = await importFeFetch();
    await feFetch("/x",);
    expect((calls[0]!.opts.headers as Headers).get("X-CSRF-Token",),).toBe("meta-tok",);
  });

  test("falls back to csrf_token cookie when no meta tag", async () => {
    cookie = "other=1; csrf_token=cookie-tok; x=2";
    const { feFetch, } = await importFeFetch();
    await feFetch("/x",);
    expect((calls[0]!.opts.headers as Headers).get("X-CSRF-Token",),).toBe("cookie-tok",);
  });

  test("matches csrf_token at the start of the cookie string", async () => {
    cookie = "csrf_token=start-tok";
    const { feFetch, } = await importFeFetch();
    await feFetch("/x",);
    expect((calls[0]!.opts.headers as Headers).get("X-CSRF-Token",),).toBe("start-tok",);
  });

  test("empty string when neither meta nor cookie carries a token", async () => {
    cookie = "other=1";
    const { feFetch, } = await importFeFetch();
    await feFetch("/x",);
    expect((calls[0]!.opts.headers as Headers).get("X-CSRF-Token",),).toBeNull();
  });

  test("empty csrf_token cookie value yields no header", async () => {
    cookie = "csrf_token=";
    const { feFetch, } = await importFeFetch();
    await feFetch("/x",);
    expect((calls[0]!.opts.headers as Headers).get("X-CSRF-Token",),).toBeNull();
  });

  test("empty meta content falls back to the cookie", async () => {
    metaContent = "";
    cookie = "csrf_token=cookie-tok";
    const { feFetch, } = await importFeFetch();
    await feFetch("/x",);
    expect((calls[0]!.opts.headers as Headers).get("X-CSRF-Token",),).toBe("cookie-tok",);
  });
});

// ── idempotency key ────────────────────────────────────────

describe("idempotency key", () => {
  test("mints a UUID when idempotencyKey === true", async () => {
    const { feFetch, } = await importFeFetch();
    await feFetch("/x", { idempotencyKey: true, },);
    const headers = calls[0]!.opts.headers as Headers;
    expect(headers.get("Idempotency-Key",),).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("uses a caller-supplied string key verbatim", async () => {
    const { feFetch, } = await importFeFetch();
    await feFetch("/x", { idempotencyKey: "my-key", },);
    const headers = calls[0]!.opts.headers as Headers;
    expect(headers.get("Idempotency-Key",),).toBe("my-key",);
  });

  test("empty string key is ignored", async () => {
    const { feFetch, } = await importFeFetch();
    await feFetch("/x", { idempotencyKey: "", },);
    const headers = calls[0]!.opts.headers as Headers;
    expect(headers.get("Idempotency-Key",),).toBeNull();
  });

  test("no key by default", async () => {
    const { feFetch, } = await importFeFetch();
    await feFetch("/x",);
    const headers = calls[0]!.opts.headers as Headers;
    expect(headers.get("Idempotency-Key",),).toBeNull();
  });
});

// ── response construction ───────────────────────────────────

describe("response construction", () => {
  test("200 text passes body and headers through", async () => {
    fetchImpl = async () => new Response("hello", { status: 200, headers: { "x-test": "1", }, },);
    const { feFetch, } = await importFeFetch();
    const res = await feFetch("/x",);
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("hello",);
    expect(res.headers.get("x-test",),).toBe("1",);
  });

  test("200 with an empty body yields an empty-text Response", async () => {
    fetchImpl = async () => new Response("", { status: 200, },);
    const { feFetch, } = await importFeFetch();
    const res = await feFetch("/x",);
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("",);
  });

  test("204 produces a null-body Response", async () => {
    fetchImpl = async () => new Response(null, { status: 204, },);
    const { feFetch, } = await importFeFetch();
    const res = await feFetch("/x",);
    expect(res.status,).toBe(204,);
    expect(res.body,).toBeNull();
  });

  test("205 produces a null-body Response", async () => {
    fetchImpl = async () => new Response(null, { status: 205, },);
    const { feFetch, } = await importFeFetch();
    const res = await feFetch("/x",);
    expect(res.status,).toBe(205,);
    expect(res.body,).toBeNull();
  });

  test("304 is rejected by safeFetch with the status attached", async () => {
    fetchImpl = async () => new Response(null, { status: 304, },);
    const { feFetch, } = await importFeFetch();
    const err = await feFetch("/x",).catch((e,) => e);
    expect(err,).toBeInstanceOf(Error,);
    expect((err as Error & { status?: number }).status,).toBe(304,);
  });

  test("stream mode returns the live Response untouched", async () => {
    const live = new Response("stream-body",);
    fetchImpl = async () => live;
    const { feFetch, } = await importFeFetch();
    const res = await feFetch("/x", { stream: true, },);
    expect(res,).toBe(live,);
  });
});

// ── error paths ────────────────────────────────────────────

describe("error paths", () => {
  test("401 throws Unauthorized and fires onAuthError", async () => {
    fetchImpl = async () => new Response("x", { status: 401, },);
    locPathname = "/views/chat";
    locSearch = "?a=1";
    const { feFetch, } = await importFeFetch();
    await expect(feFetch("/x",),).rejects.toThrow("Unauthorized",);
    expect(locAssigns,).toEqual(["/views/login?redirect=%2Fviews%2Fchat%3Fa%3D1",],);
  });

  test("401 on the login page does not redirect (loop guard)", async () => {
    fetchImpl = async () => new Response("x", { status: 401, },);
    locPathname = "/views/login";
    const { feFetch, } = await importFeFetch();
    await expect(feFetch("/x",),).rejects.toThrow("Unauthorized",);
    expect(locAssigns,).toEqual([],);
  });

  test("401 on the register page does not redirect (loop guard)", async () => {
    fetchImpl = async () => new Response("x", { status: 401, },);
    locPathname = "/views/register";
    const { feFetch, } = await importFeFetch();
    await expect(feFetch("/x",),).rejects.toThrow("Unauthorized",);
    expect(locAssigns,).toEqual([],);
  });

  test("non-401 Error rejection carries the HTTP status", async () => {
    fetchImpl = async () => new Response("nope", { status: 404, },);
    const { feFetch, } = await importFeFetch();
    const err = await feFetch("/x",).catch((e,) => e);
    expect(err,).toBeInstanceOf(Error,);
    expect((err as Error & { status?: number }).status,).toBe(404,);
  });

  test("fetch abort surfaces as a timeout error", async () => {
    fetchImpl = async () => {
      const e = new Error("The operation was aborted",);
      e.name = "AbortError";
      throw e;
    };

    const { feFetch, } = await importFeFetch();
    const err = await feFetch("/x",).catch((e,) => e);
    expect(err,).toBeInstanceOf(Error,);
    expect((err as Error).message,).toMatch(/^Request timed out after \d+ms$/,);
  });

  test("oversized content-length is rejected before the body is read", async () => {
    fetchImpl = async () => new Response("tiny", { status: 200, headers: { "content-length": "10485761", }, },);
    const { feFetch, } = await importFeFetch();
    const err = await feFetch("/x",).catch((e,) => e);
    expect((err as Error).message,).toContain("Response too large",);
  });
});

// ── option passthrough ─────────────────────────────────────

describe("option passthrough", () => {
  test("forwards request options to safeFetch", async () => {
    const { feFetch, } = await importFeFetch();
    await feFetch("/x", {
      method: "POST",
      body: "raw",
      credentials: "include",
      mode: "cors",
      cache: "no-cache",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      integrity: "sha256",
      keepalive: true,
      headers: { "X-Custom": "1", },
    },);

    expect(calls[0]!.url,).toBe("/x",);
    const opts = calls[0]!.opts;
    expect(opts.method,).toBe("POST",);
    expect(opts.body,).toBe("raw",);
    expect(opts.credentials,).toBe("include",);
    expect(opts.mode,).toBe("cors",);
    expect(opts.cache,).toBe("no-cache",);
    expect(opts.redirect,).toBe("manual",);
    expect(opts.referrerPolicy,).toBe("no-referrer",);
    expect(opts.integrity,).toBe("sha256",);
    expect(opts.keepalive,).toBe(true,);
    expect((opts.headers as Headers).get("X-Custom",),).toBe("1",);
  });
});
