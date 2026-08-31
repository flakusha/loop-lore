// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression coverage for the auth rate-limiter bucket key (getClientIp).
 *
 * Resource contract: this file owns no globals — registerLimiter is reset in
 * afterEach so bucket-budget assertions never leak across suites.
 *
 * BUG-rate-limiter-collapses-to-global-bucket-getclientip-returns-:
 * request.remoteAddress is never set for HTTP requests in Bun/Elysia, so the
 * bucket key must come from the connection-derived peerIp parameter
 * (server.requestIP(request) threaded from the route context).
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import { getClientIp, registerLimiter, } from "./shared";

/**
 * @param trustProxy
 */
function cfg(trustProxy: boolean,): Config {
  return { server: { trustProxy, }, } as unknown as Config;
}

/**
 * @param headers
 */
function req(headers?: Record<string, string>,): Request {
  return new Request("http://localhost/api/auth/login", { headers, },);
}

describe("getClientIp bucket key", () => {
  afterEach(() => {
    registerLimiter.clear();
  },);

  test("trustProxy off → connection-derived peer wins, spoofed XFF ignored", () => {
    const r = req({ "X-Forwarded-For": "6.6.6.6", },);
    expect(getClientIp(r, cfg(false,), "10.0.0.7",),).toBe("10.0.0.7",);
  });

  test("trustProxy on → trusts only the proxy-appended LAST XFF entry", () => {
    // Client forges "6.6.6.6"; trusted proxy appends the real peer.
    const r = req({ "X-Forwarded-For": "6.6.6.6, 203.0.113.9", },);
    expect(getClientIp(r, cfg(true,), "127.0.0.1",),).toBe("203.0.113.9",);
  });

  test("trustProxy on, XFF absent → x-real-ip, then CF header, then peer", () => {
    expect(
      getClientIp(req({ "x-real-ip": "198.51.100.4", },), cfg(true,), "10.0.0.1",),
    ).toBe("198.51.100.4",);
    expect(
      getClientIp(req({ "CF-Connecting-IP": "198.51.100.5", },), cfg(true,), "10.0.0.1",),
    ).toBe("198.51.100.5",);
    expect(getClientIp(req(), cfg(true,), "10.0.0.2",),).toBe("10.0.0.2",);
  });

  test("no peerIp (tests / exotic runtimes) → default deny 'unknown'", () => {
    expect(getClientIp(req(), cfg(false,), null,),).toBe("unknown",);
    expect(getClientIp(req({ "X-Forwarded-For": "6.6.6.6", },), cfg(true,), null,),).toBe("unknown",);
  });

  test("distinct peers occupy independent limiter buckets", () => {
    const a = getClientIp(req(), cfg(false,), "1.2.3.4",);
    const b = getClientIp(req(), cfg(false,), "5.6.7.8",);
    expect(a,).not.toBe(b,);
    // Exhaust A's budget; B must be unaffected (per-IP isolation restored).
    expect(registerLimiter.check(a,),).toBe(true,);
    expect(registerLimiter.check(a,),).toBe(true,);
    expect(registerLimiter.check(b,),).toBe(true,);
  });
});
