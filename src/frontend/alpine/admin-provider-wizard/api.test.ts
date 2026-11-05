// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin provider-wizard API client — the error-body contract.
 *
 * The wizard must show the SERVER's reason ("Provider name already used"),
 * never "HTTP 400": the shared apiFetch/safeFetch helper discards the body of
 * a non-2xx response. The backend answers with `{ error, code, meta }`
 * (src/routes/http-utils/errors.ts) — `error` carries the operator-facing text.
 */
import { afterEach, beforeEach, describe, expect, test, vi, } from "bun:test";
import { listSetupProviders, putModelRole, saveSetupProvider, } from "./api";

/** A request the client sent. */
interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];
let handler: (url: string, init: RequestInit,) => Promise<Response> = async () => Response.json({},);
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalLocation = (globalThis as { location?: unknown }).location;

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit,) => {
    calls.push({ url: String(url,), init: init ?? {}, },);
    return handler(String(url,), init ?? {},);
  }) as typeof fetch;

  // The CSRF token is read from the meta tag — hand the client one.
  (globalThis as { document: unknown }).document = {
    querySelector: (
      selector: string,
    ) => (selector === 'meta[name="csrf-token"]' ? { content: "csrf-token-value", } : null),
    cookie: "",
    addEventListener: () => {},
    removeEventListener: () => {},
  };
},);

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { document: unknown }).document = originalDocument;
  (globalThis as { location?: unknown }).location = originalLocation;
},);

/** The provider payload the wizard posts. */
const payload = {
  name: "openai",
  label: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

describe("provider wizard api client", () => {
  test("a rejected save surfaces the server's error message", async () => {
    handler = async () =>
      Response.json(
        { error: "Provider name already used", code: "VALIDATION_ERROR", meta: { api_version: "1", }, },
        { status: 400, },
      );

    let caught: unknown;
    try {
      await saveSetupProvider(payload,);
    } catch (err) {
      caught = err;
    }

    expect((caught as Error).message,).toBe("Provider name already used",);
    expect((caught as { status?: number }).status,).toBe(400,);
  });

  test("a rejected role assignment surfaces the server's error message", async () => {
    handler = async () => Response.json({ error: 'Invalid role: "boss"', }, { status: 400, },);

    let caught: unknown;
    try {
      await putModelRole("boss", "openai", "gpt-4o-mini",);
    } catch (err) {
      caught = err;
    }

    expect((caught as Error).message,).toBe('Invalid role: "boss"',);
  });

  test("the request carries the CSRF header and the same-origin credentials", async () => {
    handler = async () => Response.json({ ok: true, provider: { name: "openai", }, },);

    await saveSetupProvider(payload,);

    const headers = new Headers(calls[0]?.init.headers,);
    expect(headers.get("X-CSRF-Token",),).toBe("csrf-token-value",);
    expect(calls[0]?.init.credentials,).toBe("same-origin",);
  });

  test("a failed list falls back to an empty list", async () => {
    handler = async () => Response.json({ error: "Forbidden", }, { status: 403, },);

    expect(await listSetupProviders(),).toEqual([],);
  });

  test("a 401 sends the operator to the login page", async () => {
    const assigns: string[] = [];
    (globalThis as { location?: unknown }).location = {
      pathname: "/views/admin",
      search: "?tab=models",
      assign: (url: string,) => {
        assigns.push(url,);
      },
    };

    handler = async () => Response.json({ error: "Unauthorized", }, { status: 401, },);

    let caught: unknown;
    try {
      await saveSetupProvider(payload,);
    } catch (err) {
      caught = err;
    }

    expect(assigns,).toEqual(["/views/login?redirect=%2Fviews%2Fadmin%3Ftab%3Dmodels",],);
    expect((caught as Error).message,).toBe("Unauthorized",);
  });

  test("a hanging request is aborted after the timeout", async () => {
    vi.useFakeTimers();
    try {
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit,) => {
        return new Promise<Response>((_resolve, reject,) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError",),);
          },);
        },);
      }) as unknown as typeof fetch;

      const pending = saveSetupProvider(payload,);
      vi.advanceTimersByTime(30_001,);
      await expect(pending,).rejects.toThrow("Request timed out after 30000ms",);
    } finally {
      vi.useRealTimers();
    }
  });
});
