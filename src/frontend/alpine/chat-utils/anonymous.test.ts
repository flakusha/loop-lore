import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { initAnonymousModeCheck, isAnonymousMode, } from "./anonymous";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

const globalState = globalThis as unknown as { apiFetch?: ApiFetchMock };
const originalFetch = globalState.apiFetch;
let fetchMock: ApiFetchMock = async () => Response.json({},);

// The module reads the ambient `apiFetch` global at call time.
const dispatchFetch: ApiFetchMock = (url, opts,) => fetchMock(url, opts,);
beforeEach(() => {
  globalState.apiFetch = dispatchFetch;
});
afterEach(() => {
  globalState.apiFetch = originalFetch;
});

describe("anonymous mode flag", () => {
  test("isAnonymousMode defaults to false before any check", () => {
    expect(isAnonymousMode(),).toBe(false,);
  });

  test("initAnonymousModeCheck caches true when server reports anonymousMode", async () => {
    fetchMock = async () => Response.json({ anonymousMode: true, },);
    await initAnonymousModeCheck();
    expect(isAnonymousMode(),).toBe(true,);
  });

  test("missing anonymousMode field falls back to false", async () => {
    fetchMock = async () => Response.json({},);
    await initAnonymousModeCheck();
    expect(isAnonymousMode(),).toBe(false,);
  });

  test("non-ok response clears the flag", async () => {
    fetchMock = async () => Response.json({ anonymousMode: true, },);
    await initAnonymousModeCheck();
    expect(isAnonymousMode(),).toBe(true,);
    fetchMock = async () => new Response("denied", { status: 403, },);
    await initAnonymousModeCheck();
    expect(isAnonymousMode(),).toBe(false,);
  });

  test("network failure clears the flag instead of throwing", async () => {
    fetchMock = async () => {
      throw new Error("offline",);
    };
    await expect(initAnonymousModeCheck(),).resolves.toBeUndefined();
    expect(isAnonymousMode(),).toBe(false,);
  });

  test("requests the encryption status endpoint with JSON accept header", async () => {
    let seenUrl = "";
    let seenAccept: string | undefined;
    fetchMock = async (url, opts,) => {
      seenUrl = url;
      seenAccept = new Headers(opts?.headers,).get("accept",) ?? undefined;
      return Response.json({ anonymousMode: false, },);
    };
    await initAnonymousModeCheck();
    expect(seenUrl,).toBe("/api/encryption/status",);
    expect(seenAccept,).toBe("application/json",);
  });
});
