// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/agent/api/auth.test.ts — RSI agent token auth exercised through the
// ACTUAL router plugin + guard via app.handle.
//
// Parallel-safe: a per-test DB (beforeEach/afterEach) and per-test random
// tokens — no shared rows, no shared limiter state. Matrix (verified, not
// assumed): missing/unknown/revoked bearer -> 401; valid token with the
// wrong scope -> 403; correct scope passes and the context carries the
// resolved token; only the hash is at rest; 60/min per token and 600/min
// global fire as 429 with the shared X-RateLimit-* headers.

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
  AGENT_TOKEN_PREFIX,
  hashAgentToken,
  mintAgentToken,
  requireAgentScope,
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

/** Insert one agent-token row for a freshly generated plaintext. */
async function insertToken(scope: AgentTokenScope,): Promise<string> {
  const { raw, hash, } = mintAgentToken();
  await db.insertInto("agent_tokens",).values({
    id: crypto.randomUUID(),
    token_hash: hash,
    scope,
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
