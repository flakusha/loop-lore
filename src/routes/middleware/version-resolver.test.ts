// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `versionResolver()` Elysia plugin.
 *
 * Asserts that `ctx.apiVersion` is populated correctly for:
 * - `/api/v1/*` URL paths
 * - Accept-header version negotiation
 * - Default fallback (legacy `/api/*` paths)
 *
 * The third describe block is a wiring regression for
 * BUG-version-resolver-middleware-built-not-wired: verifies that
 * `createApp()` imports and mounts `versionResolver()` in
 * `src/elysia-app.ts` so the field is populated for every request.
 */

import { beforeAll, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { resolveVersion, versionResolver, } from "./version-resolver";

describe("resolveVersion (helper)", () => {
  it("returns '1' for /api/v1/ URL path", () => {
    const req = new Request("http://localhost/api/v1/chats",);
    expect(resolveVersion(req,),).toBe("1",);
  });

  it("returns '1' for /api/v1/ nested paths", () => {
    const req = new Request("http://localhost/api/v1/users/me/settings",);
    expect(resolveVersion(req,),).toBe("1",);
  });

  it("falls back to '1' for legacy /api/* paths", () => {
    const req = new Request("http://localhost/api/chats",);
    expect(resolveVersion(req,),).toBe("1",);
  });

  it("falls back to '1' for non-API paths", () => {
    const req = new Request("http://localhost/views/chat",);
    expect(resolveVersion(req,),).toBe("1",);
  });

  it("falls back to '1' for unsupported versions (e.g. v2)", () => {
    const req = new Request("http://localhost/api/v2/chats",);
    expect(resolveVersion(req,),).toBe("1",);
  });

  it("negotiates via Accept header when no URL match", () => {
    const req = new Request("http://localhost/api/chats", {
      headers: { Accept: "application/vnd.loop-lore.v1+json", },
    },);
    expect(resolveVersion(req,),).toBe("1",);
  });

  it("URL path takes priority over Accept header", () => {
    const req = new Request("http://localhost/api/v1/chats", {
      headers: { Accept: "application/json", },
    },);
    expect(resolveVersion(req,),).toBe("1",);
  });
});

/**
 * Plugin behavior: attach `versionResolver()` to an Elysia app that has a
 * catch-all route. Any request — matched or not — triggers the .derive()
 * which populates `ctx.apiVersion`. Tests probe the captured value via the
 * catch-all handler.
 *
 * The Elysia plugin chain returns a heavily-generic type that doesn't unify
 * with the bare `Elysia<>` annotation. We build the app inside the suite
 * and capture a minimal `handle()` interface — `app` is held as `unknown`
 * and the test helper narrows it to the exact surface it consumes.
 */
describe("versionResolver (Elysia plugin)", () => {
  let app: unknown;
  let capturedVersion: unknown;

  beforeAll(() => {
    app = new Elysia()
      .use(versionResolver(),)
      .all("/*", (ctx,) => {
        // The versionResolver plugin populates ctx.apiVersion on the
        // Elysia context. Capture it via a type guard that checks for
        // the property rather than an unchecked inline cast.
        if ("apiVersion" in ctx) {
          capturedVersion = ctx.apiVersion as unknown;
        }
        return new Response("ok",);
      },);
  },);

  /** Type-narrow the Elysia app fixture to its handle() surface for tests. */
  function handle(request: Request,): Promise<Response> {
    const e = app as { handle: (r: Request,) => Promise<Response> };
    return e.handle(request,);
  }

  it("populates ctx.apiVersion === '1' for /api/v1/ paths", async () => {
    capturedVersion = undefined;
    const res = await handle(new Request("http://localhost/api/v1/chats",),);
    expect(res.status,).toBe(200,);
    expect(capturedVersion,).toBe("1",);
  });

  it("populates ctx.apiVersion === '1' for legacy /api/* paths", async () => {
    capturedVersion = undefined;
    const res = await handle(new Request("http://localhost/api/chats",),);
    expect(res.status,).toBe(200,);
    expect(capturedVersion,).toBe("1",);
  });

  it("populates ctx.apiVersion === '1' for non-API paths (default fallback)", async () => {
    capturedVersion = undefined;
    const res = await handle(new Request("http://localhost/views/chat",),);
    expect(res.status,).toBe(200,);
    expect(capturedVersion,).toBe("1",);
  });

  it("honors Accept-header version negotiation when no URL match", async () => {
    capturedVersion = undefined;
    const res = await handle(
      new Request("http://localhost/api/chats", {
        headers: { Accept: "application/vnd.loop-lore.v1+json", },
      },),
    );
    expect(res.status,).toBe(200,);
    expect(capturedVersion,).toBe("1",);
  });
});

/**
 * Wiring regression: verify `createApp()` in `src/elysia-app.ts` imports and
 * calls `versionResolver()`. The wiring test reads the source file and asserts
 * the import + .use() are present (catches accidental removal of the mount).
 * Use the describe blocks above for plugin behavior tests; this is a static
 * check on the wiring contract.
 */
describe("createApp wires versionResolver (regression)", () => {
  it("imports versionResolver and mounts it via app.use(versionResolver()) before registerPlugins", async () => {
    const source = await Bun.file("src/elysia-app.ts",).text();
    expect(source,).toContain(
      'import { versionResolver, } from "./routes/middleware/version-resolver";',
    );
    const useIdx = source.indexOf("app.use(versionResolver(),);",);
    const regIdx = source.indexOf("registerPlugins(",);
    expect(useIdx,).toBeGreaterThan(-1,);
    expect(regIdx,).toBeGreaterThan(-1,);
    expect(useIdx,).toBeLessThan(regIdx,);
  });
});
