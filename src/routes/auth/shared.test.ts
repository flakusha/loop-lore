// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The auth surface's 429 response.
 *
 * Two regressions this pins: the 429 used to omit `Retry-After` and the
 * `X-RateLimit-*` trio (BUG-429-responses-omit-retry-after-and-x-ratelimit-
 * headers), and it always answered HTML even to a JSON client
 * (BUG-fix-auth-content-negotiate-the-429-rate-limit-response-like-).
 *
 * RESOURCE CONTRACT (parallel-safe): no DB, no port, no file. Importing
 * `./shared` instantiates that module's three limiter singletons (with their
 * prune timers), but this file NEVER consumes or resets them — it only calls
 * the pure response builder with a hand-built `RateLimitResult`, so sibling
 * files sharing the module registry see identical buckets.
 */
import { describe, expect, test, } from "bun:test";
import type { RateLimitResult, } from "../../middleware/rate-limit";
import { rateLimitResponse as rateLimitResponseFromRequest, } from "./request";
import { rateLimitResponse, } from "./shared";

const BLOCKED: RateLimitResult = { allowed: false, limit: 10, remaining: 0, resetSec: 42, };
const MESSAGE = "Too many login attempts";

function req(headers: Record<string, string> = {},): Request {
  return new Request("http://localhost/api/auth/login", { headers, },);
}

describe("rateLimitResponse", () => {
  test("is the same function re-exported by the request module", () => {
    // One implementation: a route importing from either module gets identical
    // limits/headers, so the two can never drift apart.
    expect(rateLimitResponse,).toBe(rateLimitResponseFromRequest,);
  });

  test("a JSON client gets the shared error envelope and the backoff headers", async () => {
    const response = rateLimitResponse({
      request: req({ Accept: "application/json", },),
      limit: BLOCKED,
      fallbackMessage: MESSAGE,
    },);

    expect(response.status,).toBe(429,);
    expect(response.headers.get("content-type",),).toContain("application/json",);
    expect(response.headers.get("Retry-After",),).toBe("42",);
    expect(response.headers.get("X-RateLimit-Limit",),).toBe("10",);
    expect(response.headers.get("X-RateLimit-Remaining",),).toBe("0",);
    expect(response.headers.get("X-RateLimit-Reset",),).toBe("42",);

    const body = await response.json() as { error: string; code: string };
    expect(body.error,).toBe(MESSAGE,);
    expect(body.code,).toBe("TOO_MANY_REQUESTS",);
  });

  test("an htmx form post keeps the inline HTML body with the same headers", async () => {
    const response = rateLimitResponse({
      request: req({ "HX-Request": "true", },),
      limit: BLOCKED,
      fallbackMessage: MESSAGE,
    },);

    expect(response.status,).toBe(429,);
    expect(response.headers.get("content-type",),).toContain("text/html",);
    expect(response.headers.get("Retry-After",),).toBe("42",);
    expect(response.headers.get("X-RateLimit-Limit",),).toBe("10",);
    // The fragment must carry the htmx swap class, not a JSON envelope.
    expect(await response.text(),).toContain(`<p class="error-msg">${MESSAGE}</p>`,);
  });

  test("the HTML branch escapes the message", async () => {
    const response = rateLimitResponse({
      request: req(),
      limit: BLOCKED,
      fallbackMessage: "slow <b>down</b>",
    },);

    expect(await response.text(),).toContain("slow &lt;b&gt;down&lt;/b&gt;",);
  });

  test("a translator replaces the fallback in both branches", async () => {
    const t = (key: string,): string => (key === "errors.rateLimited" ? "Trop de tentatives" : key);

    const json = await rateLimitResponse({
      request: req({ Accept: "application/json", },),
      limit: BLOCKED,
      t,
      fallbackMessage: MESSAGE,
    },)
      .json() as { error: string };

    expect(json.error,).toBe("Trop de tentatives",);

    const html = await rateLimitResponse({ request: req(), limit: BLOCKED, t, fallbackMessage: MESSAGE, },).text();
    expect(html,).toContain("Trop de tentatives",);
  });
});
