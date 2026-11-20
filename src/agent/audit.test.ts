// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Parallel-safe: every test owns an in-memory DB and fresh limiter instances.
// Verifies the sink writes only a 16-char digest (never plaintext) and that
// the single agent auth choke point lands a row for both allowed and denied
// requests, with the router hook stamping the final handler outcome.

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AgentTokenScope, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { hashAgentToken, mintAgentToken, requireAgentScope, } from "./api/auth";
import { agentApiRoutes, } from "./api/router";
import { finalizeAgentAction, NO_AGENT_TOKEN_DIGEST, recordAgentAction, } from "./audit";

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

/** Bare app mounting the real agent surface (fresh limiters per call). */
function makeApp(): Elysia {
  return new Elysia({ name: `test-agent-audit-${crypto.randomUUID()}`, },).use(
    agentApiRoutes({ database: db, }, "/api/v1",),
  );
}

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

describe("agent audit sink", () => {
  test("stores a 16-char digest prefix and finalizes the outcome", async () => {
    const raw = `llra_${crypto.randomUUID()}`;
    const digest = hashAgentToken(raw,).slice(0, 16,);
    const id = await recordAgentAction(db, {
      tokenDigest: digest,
      action: "whoami",
      result: "allowed",
      metadata: '{"source":"test"}',
    },);

    expect(typeof id,).toBe("number",);

    const row = await db.selectFrom("agent_actions",).selectAll().executeTakeFirstOrThrow();
    expect(row.token_digest,).toBe(digest,);
    expect(row.token_digest,).toHaveLength(16,);
    expect(row.result,).toBe("allowed",);
    expect(row.metadata,).toBe('{"source":"test"}',);
    expect(JSON.stringify(row,),).not.toContain(raw,);

    await finalizeAgentAction(db, { auditId: id!, result: "success", durationMs: 12, },);
    const done = await db.selectFrom("agent_actions",).selectAll().executeTakeFirstOrThrow();
    expect(done.result,).toBe("success",);
    expect(done.duration_ms,).toBe(12,);
  });
});

describe("agent auth choke point writes one row per request", () => {
  test("allowed call lands a success row with only the digest", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree,);
    const response = await makeApp().handle(
      new Request("http://localhost/api/v1/agent/whoami", {
        headers: { authorization: `Bearer ${raw}`, },
      },),
    );

    expect(response.status,).toBe(200,);

    const rows = await db.selectFrom("agent_actions",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.action,).toBe("whoami",);
    expect(rows[0]!.token_digest,).toBe(hashAgentToken(raw,).slice(0, 16,),);
    expect(rows[0]!.result,).toBe("success",);
    expect(typeof rows[0]!.duration_ms,).toBe("number",);
    expect(JSON.stringify(rows[0]!,),).not.toContain(raw,);
  });

  test("missing bearer lands a denied row with the sentinel digest", async () => {
    const response = await makeApp().handle(
      new Request("http://localhost/api/v1/agent/whoami",),
    );

    expect(response.status,).toBe(401,);

    const rows = await db.selectFrom("agent_actions",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.token_digest,).toBe(NO_AGENT_TOKEN_DIGEST,);
    expect(rows[0]!.result,).toBe("denied",);
  });

  test("unknown bearer lands a denied row with its digest prefix", async () => {
    const raw = `llra_${crypto.randomUUID()}`;
    const response = await makeApp().handle(
      new Request("http://localhost/api/v1/agent/whoami", {
        headers: { authorization: `Bearer ${raw}`, },
      },),
    );

    expect(response.status,).toBe(401,);

    const rows = await db.selectFrom("agent_actions",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.token_digest,).toBe(hashAgentToken(raw,).slice(0, 16,),);
    expect(rows[0]!.result,).toBe("denied",);
    expect(JSON.stringify(rows[0]!,),).not.toContain(raw,);
  });

  test("off-scope token lands a forbidden row", async () => {
    const raw = await insertToken(AgentTokenScope.Worktree,);
    const guard = requireAgentScope(AgentTokenScope.Check, { database: db, },);
    const response = await guard({
      request: new Request("http://localhost/api/v1/agent/check", {
        headers: { authorization: `Bearer ${raw}`, },
      },),
    },);

    expect((response as Response).status,).toBe(403,);

    const rows = await db.selectFrom("agent_actions",).selectAll().execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.result,).toBe("forbidden",);
    expect(rows[0]!.action,).toBe("check",);
  });
});
