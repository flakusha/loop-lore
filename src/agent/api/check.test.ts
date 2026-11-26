// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** SSE check stream: one event per gate, exit-code-derived verdict, gate
 * filter passed through to the runner, and the configurable deadline. */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AgentTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { mintAgentToken, } from "./auth";
import { checkRoutes, } from "./check";
import type { CheckExecution, } from "./types";

const PREFIX = "/api/v1";
let fixture: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  createLogger({ level: "error", },);
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

async function setup(): Promise<{ raw: string; worktreeId: string }> {
  const tokenId = crypto.randomUUID();
  const { raw, hash, expiresAt, } = mintAgentToken();
  await db.insertInto("agent_tokens",).values({
    id: tokenId,
    token_hash: hash,
    scope: AgentTokenScope.Check,
    // NULL expiry is a pre-policy credential and fails closed into 401.
    expires_at: expiresAt,
  },).execute();

  const worktreeId = crypto.randomUUID();
  await db.insertInto("rsi_agent_worktrees",).values({
    id: worktreeId,
    token_id: tokenId,
    branch: "agent/check",
    path: `/tmp/agent-${worktreeId}`,
  },).execute();

  return { raw, worktreeId, };
}

function fakeExecution(lines: string, exitCode: number,): CheckExecution {
  return {
    stream: new Response(lines,).body as ReadableStream<Uint8Array>,
    exited: Promise.resolve(exitCode,),
    kill: () => {},
  };
}

function makeApp(
  runCheck: (args: { cwd: string; gates: string | undefined },) => CheckExecution,
): Elysia {
  return new Elysia({ name: `test-agent-check-${crypto.randomUUID()}`, },).use(checkRoutes({
    database: db,
    perTokenLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 100, },),
    globalLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 100, },),
    runCheck,
  }, PREFIX,),);
}

// All cases drive the plugin through runPost below (one mount per case).

/** Mount once with the chosen runner and drive the real plugin. */
function runPost(
  raw: string,
  worktreeId: string,
  runCheck: (args: { cwd: string; gates: string | undefined },) => CheckExecution,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return makeApp(runCheck,).handle(
    new Request(`http://localhost${PREFIX}/agent/check`, {
      method: "POST",
      headers: { authorization: `Bearer ${raw}`, "content-type": "application/json", },
      body: JSON.stringify({ worktreeId, ...extra, },),
    },),
  );
}

describe("POST /agent/check SSE", () => {
  test("emits one gate event per verdict and a final event matching exit 0", async () => {
    const { raw, worktreeId, } = await setup();
    const res = await runPost(raw, worktreeId, () =>
      fakeExecution(
        "PASS: typecheck - backend\nFAIL: lint - eslint\nSKIP: tests - e2e\n",
        0,
      ),);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/event-stream",);
    const text = await res.text();
    const events = text.split("\n\n",).filter((chunk,) => chunk.startsWith("data: ",))
      .map((chunk,) => JSON.parse(chunk.slice(6,),) as { type: string; gate?: string; status?: string });

    const gates = events.filter((e,) => e.type === "gate");
    expect(gates.map((g,) => g.gate),).toEqual(["typecheck - backend", "lint - eslint", "tests - e2e",],);
    expect(gates.map((g,) => g.status),).toEqual(["pass", "fail", "skip",],);
    const final = events.at(-1,) as {
      type: string;
      status: string;
      summary: { gates: number; passed: number; failed: number };
    };

    expect(final.type,).toBe("final",);
    expect(final.status,).toBe("pass",);
    expect(final.summary.gates,).toBe(3,);
  });

  test("a non-zero exit yields final status fail", async () => {
    const { raw, worktreeId, } = await setup();
    const res = await runPost(raw, worktreeId, () => fakeExecution("FAIL: lint - eslint\n", 1,),);
    const events = (await res.text()).split("\n\n",).filter((c,) => c.startsWith("data: ",))
      .map((c,) => JSON.parse(c.slice(6,),) as { type: string; status: string });

    expect(events.at(-1,)?.status,).toBe("fail",);
  });

  test("the gates filter reaches the runner and bad gate strings are refused", async () => {
    const { raw, worktreeId, } = await setup();
    let seen: string | undefined;
    const res = await runPost(raw, worktreeId, ({ gates, },) => {
      seen = gates;
      return fakeExecution("PASS: lint - eslint\n", 0,);
    }, { gates: "lint - eslint", },);

    expect(res.status,).toBe(200,);
    expect(seen,).toBe("lint - eslint",);
    expect((await runPost(raw, worktreeId, () => fakeExecution("", 0,), { gates: "a;rm -rf /", },)).status,).toBe(400,);
  });

  test("an unknown worktree is 404", async () => {
    const { raw, } = await setup();
    expect((await runPost(raw, crypto.randomUUID(), () => fakeExecution("", 0,),)).status,).toBe(404,);
  });

  test("another token's worktree id is 404 (no cross-token reads)", async () => {
    const mine = await setup();
    const other = await setup();
    const res = await runPost(mine.raw, other.worktreeId, () => fakeExecution("PASS: lint - eslint\n", 0,),);
    expect(res.status,).toBe(404,);
  });

  test("the deadline kills the child and marks the final event timedOut", async () => {
    const { raw, worktreeId, } = await setup();
    let resolveExit!: (code: number,) => void;
    const exited = new Promise<number>((resolve,) => {
      resolveExit = resolve;
    },);

    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const execution: CheckExecution = {
      stream: new ReadableStream<Uint8Array>({
        start(c,) {
          controller = c;
          c.enqueue(new TextEncoder().encode("PASS: lint - eslint\n",),);
        },
      },),
      exited,
      kill: () => {
        resolveExit(1,);
        controller.close();
      },
    };

    const res = await runPost(raw, worktreeId, () => execution, { timeoutMs: 1000, },);
    const events = (await res.text()).split("\n\n",).filter((c,) => c.startsWith("data: ",))
      .map((c,) => JSON.parse(c.slice(6,),) as { type: string; status: string; summary: { timedOut?: boolean } });

    expect(events.at(-1,)?.status,).toBe("fail",);
    expect(events.at(-1,)?.summary.timedOut,).toBe(true,);
  }, 10_000,);
});
