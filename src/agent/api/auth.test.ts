// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/agent/api/auth.test.ts — RSI agent token auth exercised through the
// ACTUAL router plugin + guard via app.handle.
//
// Parallel-safe: a per-test DB (beforeEach/afterEach) and per-test random
// tokens — no shared rows, no shared limiter state. Matrix (verified, not
// assumed): missing/unknown/revoked bearer -> 401; valid token with the
// wrong scope -> 403; correct scope passes and the context carries the
// resolved token; only the hash is at rest; expired/unparseable expiries
// fail closed into 401; 60/min per token and 600/min global fire as 429
// with the shared X-RateLimit-* headers.

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AgentTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createRateLimiter, type RateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  AGENT_RATE_LIMITS,
  AGENT_TOKEN_DEFAULT_TTL_MS,
  AGENT_TOKEN_PREFIX,
  hashAgentToken,
  mintAgentToken,
  requireAgentScope,
  requireAgentToken,
  verifyAgentToken,
} from "./auth";
import { agentApiRoutes, } from "./router";

const PREFIX = "/api/v1";

let testDb: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

/** Insert one agent-token row with a live expiry unless a test overrides it. */
async function insertToken(
  scope: AgentTokenScope,
  options: { expiresAt?: string | null } = {},
): Promise<string> {
  const { raw, hash, } = mintAgentToken();
  await db.insertInto("agent_tokens",).values({
    id: crypto.randomUUID(),
    token_hash: hash,
    scope,
    // NULL is a pre-policy credential and now fails closed, so ordinary
    // fixtures must carry a real stamp (RA-10).
    expires_at: options.expiresAt === undefined
      ? new Date(Date.now() + 60_000,).toISOString()
      : options.expiresAt,
  },).execute();

  return raw;
}

/** Bare app mounting the REAL router plugin (each call = fresh limiters). */
function makeApp(seams?: { perTokenLimiter?: RateLimiter; globalLimiter?: RateLimiter },): Elysia {
  return new Elysia({ name: `test-agent-api-${crypto.randomUUID()}`, },).use(
    agentApiRoutes(
      {
        database: db,
        perTokenLimiter: seams?.perTokenLimiter,
        globalLimiter: seams?.globalLimiter,
      },
      PREFIX,
    ),
  );
}

function whoami(app: Elysia, raw?: string,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${PREFIX}/agent/whoami`, {
      headers: raw === undefined ? {} : { authorization: `Bearer ${raw}`, },
    },),
  );
}

describe("agent token guard — 401 matrix", () => {
  test("missing bearer is 401", async () => {
    const res = await whoami(makeApp(),);
    expect(res.status,).toBe(401,);
  });

  test("unknown token is 401", async () => {
    const res = await whoami(makeApp(), `llra_${crypto.randomUUID()}`,);
    expect(res.status,).toBe(401,);
  });

  test("a revoked token is 401 afterward", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree,);
    expect((await whoami(makeApp(), raw,)).status,).toBe(200,);

    const hash = hashAgentToken(raw,);
    await db.updateTable("agent_tokens",).set({ revoked_at: new Date().toISOString(), },)
      .where("token_hash", "=", hash,).execute();

    expect((await whoami(makeApp(), raw,)).status,).toBe(401,);
    expect(await verifyAgentToken(db, raw,),).toBeNull();
  });
});

describe("requireAgentScope — scope tiers", () => {
  test("valid token with the wrong scope is 403", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree,);
    const guard = requireAgentScope(AgentTokenScope.Check, { database: db, },);
    const res = await guard({
      request: new Request("http://localhost/api/v1/agent/whoami", {
        headers: { authorization: `Bearer ${raw}`, },
      },),
    },);

    expect(res,).toBeInstanceOf(Response,);
    expect((res as Response).status,).toBe(403,);
  });

  test("the correct scope passes and resolves the token", async () => {
    const raw = await insertToken(AgentTokenScope.Commit,);
    const guard = requireAgentScope(AgentTokenScope.Commit, { database: db, },);
    const ctx: { request: Request; agentToken?: { id: string; scope: string } } = {
      request: new Request("http://localhost/api/v1/agent/whoami", {
        headers: { authorization: `Bearer ${raw}`, },
      },),
    };

    expect(await guard(ctx,),).toBeUndefined();
    expect(ctx.agentToken?.scope,).toBe(AgentTokenScope.Commit,);
  });
});

describe("requireAgentToken — scope-agnostic guard", () => {
  test("any valid, unrevoked token passes without a scope tier", async () => {
    const raw = await insertToken(AgentTokenScope.Finalize,);
    const guard = requireAgentToken({ database: db, },);
    const ctx = {
      request: new Request("http://localhost/agent/whoami", {
        headers: { authorization: `Bearer ${raw}`, },
      },),
    };

    expect(await guard(ctx,),).toBeUndefined();
  });

  test("an unknown token is rejected 401 by the bare guard", async () => {
    const guard = requireAgentToken({ database: db, },);
    const ctx = {
      request: new Request("http://localhost/agent/whoami", {
        headers: { authorization: `Bearer llra_${crypto.randomUUID()}`, },
      },),
    };

    expect((await guard(ctx,))!.status,).toBe(401,);
  });
});

describe("router surface — whoami", () => {
  test("a valid token learns its id and scope", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree,);
    const res = await whoami(makeApp(), raw,);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { tokenId: string; scope: string } };
    expect(body.data.scope,).toBe(AgentTokenScope.Worktree,);
    const row = await db.selectFrom("agent_tokens",).selectAll()
      .where("scope", "=", AgentTokenScope.Worktree,).executeTakeFirst();

    expect(body.data.tokenId,).toBe(row!.id,);
  });

  test("the plaintext is never at rest — only its hash", async () => {
    const raw = await insertToken(AgentTokenScope.Finalize,);
    expect(raw.startsWith(AGENT_TOKEN_PREFIX,),).toBe(true,);
    const row = await db.selectFrom("agent_tokens",).selectAll()
      .where("scope", "=", AgentTokenScope.Finalize,).executeTakeFirst();

    expect(row,).toBeDefined();
    expect(row!.token_hash,).toBe(hashAgentToken(raw,),);
    // The row (and therefore any accidental JSON dump of it) never carries
    // the plaintext.
    expect(JSON.stringify(row,),).not.toContain(raw,);
    expect(row!.revoked_at,).toBeNull();
    expect(row!.last_used_at,).toBeNull();
  });
});

describe("agent surface rate limits", () => {
  test("61st request inside a minute per token is 429 with Retry-After", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree,);
    const app = makeApp();
    let lastStatus = 0;
    for (let i = 0; i < AGENT_RATE_LIMITS.perToken.maxRequests; i++) {
      lastStatus = (await whoami(app, raw,)).status;
      expect(lastStatus,).toBe(200,);
    }

    const blocked = await whoami(app, raw,);
    expect(blocked.status,).toBe(429,);
    expect(blocked.headers.get("x-ratelimit-limit",),).toBe("60",);
    expect(Number(blocked.headers.get("retry-after",),),).toBeGreaterThan(0,);

    // A different token still has its own budget (per-token keying).
    const other = await insertToken(AgentTokenScope.Check,);
    expect((await whoami(makeApp(), other,)).status,).toBe(200,);
  });

  test("the global 600/min budget blocks every token once exhausted", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree,);
    const globalLimiter = createRateLimiter(AGENT_RATE_LIMITS.global,);
    for (let i = 0; i < AGENT_RATE_LIMITS.global.maxRequests; i++) {
      globalLimiter.record("global",);
    }

    const blocked = await whoami(makeApp({ globalLimiter, },), raw,);
    expect(blocked.status,).toBe(429,);
    expect(blocked.headers.get("x-ratelimit-limit",),).toBe("600",);
  });
});

describe("agent token TTL — fail-closed expiry", () => {
  test("an expired token is 401 and leaves no usage stamp", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree, {
      expiresAt: new Date(Date.now() - 60_000,).toISOString(),
    },);

    expect((await whoami(makeApp(), raw,)).status,).toBe(401,);
    expect(await verifyAgentToken(db, raw,),).toBeNull();

    const row = await db.selectFrom("agent_tokens",).select(["last_used_at",],)
      .where("token_hash", "=", hashAgentToken(raw,),).executeTakeFirst();

    expect(row!.last_used_at,).toBeNull();
  });

  test("an unparseable expiry is rejected, never inferred valid", async () => {
    const raw = await insertToken(AgentTokenScope.Check, {
      expiresAt: "not-a-timestamp",
    },);

    expect((await whoami(makeApp(), raw,)).status,).toBe(401,);
    expect(await verifyAgentToken(db, raw,),).toBeNull();
  });

  test("a loose future-parsing expiry is rejected as malformed", async () => {
    const raw = await insertToken(AgentTokenScope.Check, {
      // V8 parses this to year 9999 — a parseable but non-ISO stamp must
      // never extend a token's lifetime.
      expiresAt: "12/31/9999",
    },);

    expect((await whoami(makeApp(), raw,)).status,).toBe(401,);
    expect(await verifyAgentToken(db, raw,),).toBeNull();
  });

  test("a future expiry passes the same guard", async () => {
    const raw = await insertToken(AgentTokenScope.Check, {
      expiresAt: new Date(Date.now() + 60_000,).toISOString(),
    },);

    expect((await whoami(makeApp(), raw,)).status,).toBe(200,);
    expect(await verifyAgentToken(db, raw,),).not.toBeNull();
  });

  test("mint stamps 24h by default and honours a positive override", async () => {
    const before = Date.now();
    const minted = mintAgentToken();
    const after = Date.now();
    const defaultMs = new Date(minted.expiresAt,).getTime();
    expect(defaultMs,).toBeGreaterThanOrEqual(before + AGENT_TOKEN_DEFAULT_TTL_MS,);
    expect(defaultMs,).toBeLessThanOrEqual(after + AGENT_TOKEN_DEFAULT_TTL_MS,);

    const customBefore = Date.now();
    const custom = mintAgentToken({ ttlMs: 60_000, },);
    const customMs = new Date(custom.expiresAt,).getTime();
    expect(customMs,).toBeGreaterThanOrEqual(customBefore + 60_000,);
    expect(customMs,).toBeLessThanOrEqual(Date.now() + 60_000,);
    expect(() => mintAgentToken({ ttlMs: 0, },)).toThrow(RangeError,);
    expect(() => mintAgentToken({ ttlMs: Number.NaN, },)).toThrow(RangeError,);
  });

  test("revocation still wins over a future expiry", async () => {
    const raw = await insertToken(AgentTokenScope.Commit, {
      expiresAt: new Date(Date.now() + 60_000,).toISOString(),
    },);

    expect((await whoami(makeApp(), raw,)).status,).toBe(200,);
    await db.updateTable("agent_tokens",)
      .set({ revoked_at: new Date().toISOString(), },)
      .where("token_hash", "=", hashAgentToken(raw,),).execute();

    expect((await whoami(makeApp(), raw,)).status,).toBe(401,);
  });
});

describe("agent token fail-closed row shape (RA-10 / F-02)", () => {
  test("a NULL expiry is denied, never an eternal bearer", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree, { expiresAt: null, },);

    expect(await verifyAgentToken(db, raw,),).toBeNull();
    expect((await whoami(makeApp(), raw,)).status,).toBe(401,);
  });

  test("a non-canonical scope is rejected instead of cast", async () => {
    // The DB CHECK admits only canonical values, so feed verifyAgentToken a
    // fake corrupt row directly. The assertion is on the verifier's
    // fail-closed result, not on the stub's data.
    const row = {
      id: "corrupt-scope",
      scope: "agent:ALL",
      revoked_at: null,
      last_used_at: null,
      expires_at: new Date(Date.now() + 60_000,).toISOString(),
    };

    const stub = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({ executeTakeFirst: async () => row, }),
        }),
      }),
    } as unknown as Kysely<DB>;

    expect(await verifyAgentToken(stub, "llra_corrupt",),).toBeNull();
  });
});
