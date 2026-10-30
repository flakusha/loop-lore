// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
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
  requestId?: string;
},): GuestReadGuardCtx {
  return {
    request: opts?.method && opts.method !== "GET"
      ? greqMethod(opts.method, pathname,)
      : greq(pathname, opts?.headers,),
    userId: opts?.userId ?? null,
    userRole: opts?.userRole ?? null,
    requestId: opts?.requestId,
    server: peer(opts?.address ?? "10.0.0.1",),
    set: {},
  };
}

const created: GuestReadLimiter[] = [];
function limiter(config: Config, database?: Db | null,): GuestReadLimiter {
  const l = createGuestReadLimiter({ config, database, },);
  created.push(l,);
  return l;
}

afterEach(() => {
  for (const l of created) { l.destroy(); }
  created.length = 0;
},);

async function auditRows(db: Db,) {
  return db.selectFrom("log_entries",).selectAll()
    .where("event_type", "=", "guest.read",).execute();
}

describe("createGuestReadLimiter", () => {
  test("guest read over the limit gets 429 with Retry-After", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 2, },),);
    const ctx = gctx("/api/chats", { userRole: "guest", },);
    expect(await guard(ctx,),).toBeUndefined();
    expect(await guard(ctx,),).toBeUndefined();
    const blocked = await guard(ctx,);
    expect(blocked,).toBeInstanceOf(Response,);
    expect(blocked?.status,).toBe(429,);
    expect(blocked?.headers.get("Retry-After",),).toBeDefined();
    expect(blocked?.headers.get("X-RateLimit-Limit",),).toBe("2",);
  });

  test("registered users are never limited", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    for (let i = 0; i < 10; i++) {
      expect(await guard(gctx("/api/chats", { userId: "u-1", userRole: "user", },),),).toBeUndefined();
    }
  });

  test("non-guest roles are never limited", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    for (let i = 0; i < 5; i++) {
      expect(await guard(gctx("/api/chats", { userId: null, userRole: "user", },),),).toBeUndefined();
    }
  });

  test("non-guest-read paths do not consume budget", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    const off = gctx("/api/admin/users", { userRole: "guest", },);
    expect(await guard(off,),).toBeUndefined();
    expect(await guard(off,),).toBeUndefined();
    // The budget is intact: the first in-shape read still passes.
    expect(await guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
  });

  test("non-GET methods do not consume budget", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    expect(await guard(gctx("/api/chats", { userRole: "guest", method: "POST", },),),).toBeUndefined();
    expect(await guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
  });

  test("trustProxy on keys the bucket by the proxy-appended XFF entry", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, trustProxy: true, },),);
    const spoofed = gctx("/api/chats", {
      userRole: "guest",
      address: "127.0.0.1",
      headers: { "X-Forwarded-For": "6.6.6.6, 203.0.113.9", },
    },);

    expect(await guard(spoofed,),).toBeUndefined();
    // Same 203.0.113.9 bucket: blocked even from a different connection peer…
    const again = gctx("/api/chats", {
      userRole: "guest",
      address: "10.9.9.9",
      headers: { "X-Forwarded-For": "203.0.113.9", },
    },);

    expect((await guard(again,))?.status,).toBe(429,);
    // …while a distinct peer without XFF keeps its own bucket.
    expect(await guard(gctx("/api/chats", { userRole: "guest", address: "10.0.0.2", },),),).toBeUndefined();
  });

  test("trustProxy off ignores spoofed XFF (connection peer keys the bucket)", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, trustProxy: false, },),);
    const spoofed = gctx("/api/chats", {
      userRole: "guest",
      address: "10.0.0.1",
      headers: { "X-Forwarded-For": "6.6.6.6", },
    },);

    expect(await guard(spoofed,),).toBeUndefined();
    expect((await guard(spoofed,))?.status,).toBe(429,);
  });

  test("/api/v1 reads share the /api bucket (version-stripped shape match)", async () => {
    const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },),);
    expect(await guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
    expect((await guard(gctx("/api/v1/chats", { userRole: "guest", },),))?.status,).toBe(429,);
  });

  test("config defaults apply when the guest fields are unset", async () => {
    const { guard, } = limiter(makeConfig(),);
    for (let i = 0; i < 60; i++) {
      expect(await guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
    }

    expect((await guard(gctx("/api/chats", { userRole: "guest", },),))?.status,).toBe(429,);
  });
});

describe("guest read audit rows", () => {
  test("allowed guest read writes exactly one audit row with expected fields", async () => {
    const f = await createTestDb();
    try {
      const { guard, } = limiter(makeConfig(), f.db,);
      expect(await guard(gctx("/api/worlds/wld-1", { userRole: "guest", requestId: "req-1", },),),).toBeUndefined();
      const rows = await auditRows(f.db,);
      expect(rows.length,).toBe(1,);
      expect(rows[0]!.level,).toBe(6,);
      expect(rows[0]!.request_id,).toBe("req-1",);
      // No invented identity: the guest tier has no user row.
      expect(rows[0]!.user_id,).toBeNull();
      expect(rows[0]!.action,).toBe("read",);
      const meta = JSON.parse(rows[0]!.meta!,);
      expect(meta.userRole,).toBe("guest",);
      expect(meta.route,).toBe("/api/worlds/wld-1",);
      expect(meta.targetId,).toBe("wld-1",);
      expect(meta.ip,).toBe("10.0.0.1",);
    } finally {
      await destroyTestDb(f,);
    }
  });

  test("collection routes write no targetId", async () => {
    const f = await createTestDb();
    try {
      const { guard, } = limiter(makeConfig(), f.db,);
      expect(await guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
      const rows = await auditRows(f.db,);
      expect(rows.length,).toBe(1,);
      expect(JSON.parse(rows[0]!.meta!,).targetId,).toBeNull();
    } finally {
      await destroyTestDb(f,);
    }
  });

  test("429 rejections are not logged (rows = served reads)", async () => {
    const f = await createTestDb();
    try {
      const { guard, } = limiter(makeConfig({ guestReadLimit: 1, },), f.db,);
      expect(await guard(gctx("/api/chats", { userRole: "guest", },),),).toBeUndefined();
      expect((await guard(gctx("/api/chats", { userRole: "guest", },),))?.status,).toBe(429,);
      expect((await auditRows(f.db,)).length,).toBe(1,);
    } finally {
      await destroyTestDb(f,);
    }
  });

  test("registered reads write no audit rows", async () => {
    const f = await createTestDb();
    try {
      const { guard, } = limiter(makeConfig(), f.db,);
      for (let i = 0; i < 5; i++) {
        expect(await guard(gctx("/api/chats", { userId: "u-1", userRole: "user", },),),).toBeUndefined();
      }

      expect((await auditRows(f.db,)).length,).toBe(0,);
    } finally {
      await destroyTestDb(f,);
    }
  });

  test("audit failure never fails the read", async () => {
    const broken = {
      insertInto: () => {
        throw new Error("boom",);
      },
    } as unknown as Db;

    const { guard, } = limiter(makeConfig(), broken,);
    await expect(guard(gctx("/api/chats", { userRole: "guest", },),),).resolves.toBeUndefined();
  });
});
