// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { gifSearchRoutes, normalizeGifResults, resolveTenorKey, } from "./search";

type FetchStub = (url: string,) => Promise<Response>;

interface TestDeps {
  userId: string | null;
  fetchImpl?: FetchStub;
  tenorApiKey?: string;
}

function makeApp(deps: TestDeps,) {
  return new Elysia({ name: "test-gifs", },)
    .derive(() => ({ userId: deps.userId, userRole: "user", }))
    .use(gifSearchRoutes({
      database: {} as Kysely<DB>,
      config: {} as Config,
      fetchImpl: deps.fetchImpl as typeof fetch | undefined,
      tenorApiKey: deps.tenorApiKey,
    },),);
}

function tenorBody() {
  return {
    results: [{
      id: "123",
      title: "dancing cat",
      media_formats: {
        gif: { url: "https://media.example/full.gif", dims: [200, 150,], },
        tinygif: { url: "https://media.example/tiny.gif", dims: [100, 75,], },
      },
    },],
  };
}

const savedEnv = process.env.TENOR_API_KEY;

beforeEach(() => {
  delete process.env.TENOR_API_KEY;
},);

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env.TENOR_API_KEY;
  } else {
    process.env.TENOR_API_KEY = savedEnv;
  }
},);

describe("gifSearchRoutes — GET /api/gifs/search", () => {
  test("401 when no userId is derived", async () => {
    const app = makeApp({ userId: null, tenorApiKey: "k", },);
    const res = await app.handle(new Request("http://localhost/api/gifs/search?q=cats",),);
    expect(res.status,).toBe(401,);
  });

  test("4xx when q is missing", async () => {
    const app = makeApp({ userId: "u1", tenorApiKey: "k", },);
    const res = await app.handle(new Request("http://localhost/api/gifs/search",),);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
  });

  test("501 when no provider key is configured", async () => {
    const app = makeApp({ userId: "u1", },);
    const res = await app.handle(new Request("http://localhost/api/gifs/search?q=cats",),);
    expect(res.status,).toBe(501,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("not configured",);
  });

  test("200 normalizes upstream results and forwards key + query", async () => {
    let seenUrl = "";
    const app = makeApp({
      userId: "u1",
      tenorApiKey: "secret-key",
      fetchImpl: async (url,) => {
        seenUrl = url;
        return Response.json(tenorBody(),);
      },
    },);
    const res = await app.handle(new Request("http://localhost/api/gifs/search?q=cats&limit=5",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      data: { id: string; title: string; url: string; previewUrl: string; width: number; height: number }[];
    };
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0],).toEqual({
      id: "123",
      title: "dancing cat",
      url: "https://media.example/full.gif",
      previewUrl: "https://media.example/tiny.gif",
      width: 200,
      height: 150,
    },);
    expect(seenUrl,).toContain("q=cats",);
    expect(seenUrl,).toContain("key=secret-key",);
    expect(seenUrl,).toContain("limit=5",);
  });

  test("upstream 429 passes through as 429", async () => {
    const app = makeApp({
      userId: "u1",
      tenorApiKey: "k",
      fetchImpl: async () => new Response("", { status: 429, },),
    },);
    const res = await app.handle(new Request("http://localhost/api/gifs/search?q=cats",),);
    expect(res.status,).toBe(429,);
  });

  test("upstream 500 maps to 502", async () => {
    const app = makeApp({
      userId: "u1",
      tenorApiKey: "k",
      fetchImpl: async () => new Response("", { status: 500, },),
    },);
    const res = await app.handle(new Request("http://localhost/api/gifs/search?q=cats",),);
    expect(res.status,).toBe(502,);
  });

  test("unreachable provider maps to 502", async () => {
    const app = makeApp({
      userId: "u1",
      tenorApiKey: "k",
      fetchImpl: async () => {
        throw new Error("offline",);
      },
    },);
    const res = await app.handle(new Request("http://localhost/api/gifs/search?q=cats",),);
    expect(res.status,).toBe(502,);
  });
});

describe("resolveTenorKey", () => {
  const base = { database: {} as Kysely<DB>, config: {} as Config, };
  test("prefers the explicit opt over the environment", () => {
    process.env.TENOR_API_KEY = "env-key";
    expect(resolveTenorKey({ ...base, tenorApiKey: "opt-key", },),).toBe("opt-key",);
  });

  test("falls back to the environment", () => {
    process.env.TENOR_API_KEY = "env-key";
    expect(resolveTenorKey(base,),).toBe("env-key",);
  });

  test("returns null when nothing is configured", () => {
    expect(resolveTenorKey(base,),).toBeNull();
  });
});

describe("normalizeGifResults", () => {
  test("skips entries without a gif format and caps at limit", () => {
    const body = {
      results: [
        { id: "a", media_formats: { gif: { url: "https://x/a.gif", }, }, },
        { id: "b", media_formats: {}, },
        { id: "c", media_formats: { gif: { url: "https://x/c.gif", }, }, },
      ],
    };
    const out = normalizeGifResults(body, 2,);
    expect(out.map((r,) => r.id),).toEqual(["a", "c",],);
    expect(out[0]!.previewUrl,).toBe("https://x/a.gif",);
    expect(out[0]!.width,).toBe(0,);
  });
});
