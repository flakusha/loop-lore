// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import {
  createGuestReadLimiter,
  type GuestReadGuardCtx,
  type GuestReadLimiter,
} from "./guest-rate-limit";

/**
 * Minimal config for the limiter: only the fields the guard reads.
 * Undefined guest fields exercise the AUTH_DEFAULTS fallback path.
 */
function makeConfig(overrides?: {
  guestReadLimit?: number;
  guestReadWindowSec?: number;
  trustProxy?: boolean;
},): Config {
  return {
    auth: {
      required: true,
      guestAccess: true,
      guestReadLimit: overrides?.guestReadLimit,
      guestReadWindowSec: overrides?.guestReadWindowSec,
    },
    server: { trustProxy: overrides?.trustProxy ?? false, },
  } as unknown as Config;
}

function greq(pathname: string, headers?: Record<string, string>,): Request {
  return new Request(`http://localhost${pathname}`, { method: "GET", headers, },);
}

function greqMethod(method: string, pathname: string,): Request {
  return new Request(`http://localhost${pathname}`, { method, },);
}

const peer = (address: string,): GuestReadGuardCtx["server"] => ({
  requestIP: () => ({ address, }),
});

function gctx(pathname: string, opts?: {
  userId?: string | null;
  userRole?: string | null;
  address?: string;
  headers?: Record<string, string>;
  method?: string;
},): GuestReadGuardCtx {
  return {
    request: opts?.method && opts.method !== "GET"
      ? greqMethod(opts.method, pathname,)
      : greq(pathname, opts?.headers,),
    userId: opts?.userId ?? null,
    userRole: opts?.userRole ?? null,
    server: peer(opts?.address ?? "10.0.0.1",),
    set: {},
  };
}

const created: GuestReadLimiter[] = [];
function limiter(config: Config,): GuestReadLimiter {
  const l = createGuestReadLimiter({ config, },);
  created.push(l,);
  return l;
}

afterEach(() => {
  for (const l of created) { l.destroy(); }
  created.length = 0;
},);

describe("createGuestReadLimiter", () => {
  test("guest read over the limit gets 429 with Retry-After", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 2, },),);
    const ctx = gctx("/api/chats", { userRole: "guest", },);
    expect(guard(ctx,),).toBeUndefined();
    expect(guard(ctx,),).toBeUndefined();
    const blocked = guard(ctx,);
    expect(blocked,).toBeInstanceOf(Response,);
    expect(blocked?.status,).toBe(429,);
    expect(blocked?.headers.get("Retry-After",),).toBeDefined();
    expect(blocked?.headers.get("X-RateLimit-Limit",),).toBe("2",);
  });

  test("registered users are never limited", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    for (let i = 0; i < 10; i++) {
      expect(guard(gctx("/api/chats", { userId: "u-1", userRole: "user", },),),).toBeUndefined();
    }
  });

  test("non-guest roles are never limited", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    for (let i = 0; i < 5; i++) {
      expect(guard(gctx("/api/chats", { userId: null, userRole: "user", },),),).toBeUndefined();
    }
  });

  test("non-guest-read paths do not consume budget", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    const off = gctx("/api/admin/users", { userRole: "guest", },);
    expect(guard(off,),).toBeUndefined();
    expect(guard(off,),).toBeUndefined();
    // The budget is intact: the first in-shape read still passes.
    expect(guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
  });

  test("non-GET methods do not consume budget", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    expect(guard(gctx("/api/chats", { userRole: "guest", method: "POST", },),),).toBeUndefined();
    expect(guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
  });

  test("trustProxy on keys the bucket by the proxy-appended XFF entry", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, trustProxy: true, },),);
    const spoofed = gctx("/api/chats", {
      userRole: "guest",
      address: "127.0.0.1",
      headers: { "X-Forwarded-For": "6.6.6.6, 203.0.113.9", },
    },);

    expect(guard(spoofed,),).toBeUndefined();
    // Same 203.0.113.9 bucket: blocked even from a different connection peer…
    const again = gctx("/api/chats", {
      userRole: "guest",
      address: "10.9.9.9",
      headers: { "X-Forwarded-For": "203.0.113.9", },
    },);

    expect(guard(again,)?.status,).toBe(429,);
    // …while a distinct peer without XFF keeps its own bucket.
    expect(guard(gctx("/api/chats", { userRole: "guest", address: "10.0.0.2", },),),).toBeUndefined();
  });

  test("trustProxy off ignores spoofed XFF (connection peer keys the bucket)", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, trustProxy: false, },),);
    const spoofed = gctx("/api/chats", {
      userRole: "guest",
      address: "10.0.0.1",
      headers: { "X-Forwarded-For": "6.6.6.6", },
    },);

    expect(guard(spoofed,),).toBeUndefined();
    expect(guard(spoofed,)?.status,).toBe(429,);
  });

  test("/api/v1 reads share the /api bucket (version-stripped shape match)", () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    expect(guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
    expect(guard(gctx("/api/v1/chats", { userRole: "guest", },),)?.status,).toBe(429,);
  });

  test("config defaults apply when the guest fields are unset", () => {
    const { guard, } = limiter(makeConfig(),);
    for (let i = 0; i < 60; i++) {
      expect(guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
    }

    expect(guard(gctx("/api/chats", { userRole: "guest", },),)?.status,).toBe(429,);
  });
});
