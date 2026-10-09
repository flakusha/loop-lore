// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { fetchWorldJson, } from "./world-fetch";

// Bare-global apiFetch pattern (mirrors world-locations.test.ts): htmx.ts
// resolves the global at call time, so stubbing it here is enough.
const g = globalThis as unknown as {
  apiFetch?: (url: string | URL, opts?: RequestInit,) => Promise<Response>;
};

const originalApiFetch = g.apiFetch;
let fetchHandler: ((url: string,) => Response) | null = null;

beforeEach(() => {
  fetchHandler = null;
  g.apiFetch = async (url: string | URL,) => {
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,),);
  };
},);

afterEach(() => {
  fetchHandler = null;
  g.apiFetch = originalApiFetch;
},);

describe("fetchWorldJson", () => {
  test("returns parsed body on 2xx", async () => {
    fetchHandler = () => Response.json({ data: ["a",], },);
    const body = await fetchWorldJson<{ data: string[] }>("w1", "/chats",);
    expect(body,).toEqual({ data: ["a",], },);
  });

  test("builds the world-scoped URL", async () => {
    let seen = "";
    g.apiFetch = async (url: string | URL,) => {
      seen = String(url,);
      return Response.json({},);
    };

    await fetchWorldJson("w1", "/travel/status",);
    expect(seen,).toBe("/api/v1/worlds/w1/travel/status",);
  });

  test("returns null on non-2xx", async () => {
    fetchHandler = () => new Response("{}", { status: 404, },);
    expect(await fetchWorldJson("w1", "/chats",),).toBeNull();
  });

  test("returns null on network failure", async () => {
    g.apiFetch = async () => {
      throw new Error("offline",);
    };

    expect(await fetchWorldJson("w1", "/chats",),).toBeNull();
  });

  test("returns null for a nullish world id without fetching", async () => {
    let called = false;
    g.apiFetch = async () => {
      called = true;
      return Response.json({},);
    };

    expect(await fetchWorldJson(null, "/chats",),).toBeNull();
    expect(await fetchWorldJson(undefined, "/chats",),).toBeNull();
    expect(await fetchWorldJson("", "/chats",),).toBeNull();
    expect(called,).toBe(false,);
  });
});
