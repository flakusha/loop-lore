// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration test for the centralized response-header + dynamic-response
 * policy wiring (server.ts createRequestHandler). Exercises the SAME
 * production handler used by HTTP/HTTPS servers, but without binding a
 * real socket (the local fetch path is intercepted by the sandbox proxy).
 *
 * Verifies previously-dead ResponseHeaderPolicy / DynamicResponsePolicy
 * are now applied to every outgoing response.
 */

import { loadConfig, } from "@/config/load";
import { createLogger, } from "@/logger";
import { createRequestHandler, } from "@/server";
import { describe, expect, test, } from "bun:test";

function stubApp(body: string, headers: Record<string, string>, status = 200,) {
  return {
    async fetch(_request: Request,): Promise<Response> {
      return new Response(body, { status, headers, },);
    },
  };
}

describe("createRequestHandler policy wiring", () => {
  const logger = createLogger({ level: "error", },);
  const config = loadConfig();

  test("API responses carry security headers", async () => {
    const app = stubApp('{"ok":true}', { "content-type": "application/json", },);
    const handler = createRequestHandler(app, config, logger,);

    const res = await handler(new Request("http://localhost/api/auth/me",),);
    expect(res.headers.get("referrer-policy",),).toBeTruthy();
    expect(res.headers.get("x-frame-options",),).toBeTruthy();
    expect(res.headers.get("x-content-type-options",),).toBe("nosniff",);
    expect(res.headers.get("cross-origin-resource-policy",),).toBeTruthy();
  });

  test("static (404) responses also carry security headers", async () => {
    const app = stubApp("Not found", { "content-type": "text/plain", }, 404,);
    const handler = createRequestHandler(app, config, logger,);

    const res = await handler(new Request("http://localhost/no-such-route",),);
    expect(res.status,).toBe(404,);
    expect(res.headers.get("referrer-policy",),).toBeTruthy();
    expect(res.headers.get("x-frame-options",),).toBeTruthy();
    expect(res.headers.get("x-content-type-options",),).toBe("nosniff",);
  });

  test("JSON bodies are compressed when client advertises br", async () => {
    const body = ".".repeat(2048,);
    const app = stubApp(body, { "content-type": "application/json", },);
    const handler = createRequestHandler(app, config, logger,);

    const res = await handler(
      new Request("http://localhost/api/chats", { headers: { "accept-encoding": "br", }, },),
    );
    expect(res.headers.get("content-encoding",),).toBe("br",);
    expect(res.headers.get("vary",),).toContain("Accept-Encoding",);
  });

  test("route-set headers are not clobbered", async () => {
    const app = stubApp('{"ok":true}', {
      "content-type": "application/json",
      "cache-control": "no-store",
    },);
    const handler = createRequestHandler(app, config, logger,);

    const res = await handler(new Request("http://localhost/api/auth/me",),);
    expect(res.headers.get("cache-control",),).toBe("no-store",);
  });
});
