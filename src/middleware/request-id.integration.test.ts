// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration test for requestIdMiddleware Elysia derive wiring.
 *
 * Exercises the real Elysia derive chain (not the isolated unit helpers) to
 * verify the middleware:
 *   - echoes a valid client-supplied X-Request-Id back to the client,
 *   - generates a UUID when the header is missing,
 *   - generates a UUID when the supplied id is malformed,
 *   - honors the Idempotency-Key alias,
 *   - populates ctx.requestId for downstream handlers.
 * @see TASK-middleware-request-id-elysia-derive.md
 */

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { requestIdMiddleware, } from "./request-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Minimal ctx shape the handler reads — keeps the test typed without `any`. */
interface EchoCtx {
  requestId: string;
  request: Request;
}

interface EchoBody {
  requestId: string;
  header: string | null;
}

/** Build a minimal app with the request-id derive + an echo route. */
function makeApp() {
  let seen: string | null = null;
  const app = new Elysia()
    .derive(requestIdMiddleware(),)
    .get("/echo", (ctx: EchoCtx,) => {
      seen = ctx.requestId;
      const body: EchoBody = {
        requestId: ctx.requestId,
        header: ctx.request.headers.get("x-request-id",),
      };
      return body;
    },);
  return { app, getSeen: () => seen, };
}

describe("requestIdMiddleware (Elysia derive integration)", () => {
  test("echoes a valid client-supplied X-Request-Id back to the client", async () => {
    const { app, } = makeApp();
    const res = await app.handle(
      new Request("http://localhost/echo", { headers: { "x-request-id": "client-abc-123", }, },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as EchoBody;
    expect(body.requestId,).toBe("client-abc-123",);
    expect(body.header,).toBe("client-abc-123",);
  });

  test("generates a UUID when the X-Request-Id header is missing", async () => {
    const { app, } = makeApp();
    const res = await app.handle(new Request("http://localhost/echo",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as EchoBody;
    expect(body.requestId,).toMatch(UUID_RE,);
    expect(body.header,).toBe(body.requestId,); // header populated from ctx id
  });

  test("generates a UUID when the supplied id is malformed (control chars)", async () => {
    const { app, } = makeApp();
    const res = await app.handle(
      new Request("http://localhost/echo", { headers: { "x-request-id": "has space;DROP", }, },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as EchoBody;
    expect(body.requestId,).toMatch(UUID_RE,);
    expect(body.requestId.startsWith("has",),).toBe(false,); // bad input NOT echoed
  });

  test("generates a UUID when the supplied id is oversized", async () => {
    const { app, } = makeApp();
    const res = await app.handle(
      new Request("http://localhost/echo", { headers: { "x-request-id": "a".repeat(200,), }, },),
    );
    const body = await res.json() as EchoBody;
    expect(body.requestId,).toMatch(UUID_RE,);
  });

  test("honors the Idempotency-Key alias when X-Request-Id is absent", async () => {
    const { app, } = makeApp();
    const res = await app.handle(
      new Request("http://localhost/echo", { headers: { "idempotency-key": "idem-key-7", }, },),
    );
    const body = await res.json() as EchoBody;
    expect(body.requestId,).toBe("idem-key-7",);
    expect(body.header,).toBe("idem-key-7",); // canonical header set from alias
  });

  test("prefers X-Request-Id over Idempotency-Key when both present", async () => {
    const { app, } = makeApp();
    const res = await app.handle(
      new Request("http://localhost/echo", {
        headers: { "x-request-id": "primary", "idempotency-key": "fallback", },
      },),
    );
    const body = await res.json() as EchoBody;
    expect(body.requestId,).toBe("primary",);
  });

  test("populates ctx.requestId for downstream handlers", async () => {
    const { app, getSeen, } = makeApp();
    await app.handle(
      new Request("http://localhost/echo", { headers: { "x-request-id": "downstream-check", }, },),
    );
    expect(getSeen(),).toBe("downstream-check",);
  });

  test("every request gets a distinct id when header is absent", async () => {
    const { app, } = makeApp();
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await app.handle(new Request("http://localhost/echo",),);
      const body = await res.json() as EchoBody;
      seen.add(body.requestId,);
    }
    expect(seen.size,).toBe(5,); // all distinct
  });
});
