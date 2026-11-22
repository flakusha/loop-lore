// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Agent ticket lifecycle (RSI #18): auth matrix, briefing rejection,
 * ownership, audit trail and the orphan-issue regression. Each test owns a
 * temp ticket dir + in-memory DB, so `--isolate` and parallel runs are safe.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { type Kysely, sql, } from "kysely";
import { mkdtempSync, readdirSync, readFileSync, rmSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { AgentTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { mintAgentToken, } from "./auth";
import { MIN_TICKET_SCORE, ticketRoutes, } from "./tickets";

const PREFIX = "/api/v1";
type Op = "open" | "close" | "comment";

let fixture: TestDb;
let db: Kysely<DB>;
let ticketsDir: string;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  // Gitignored in-repo scratch: keeps fixtures next to the toolchain without polluting the tracked tree.
  ticketsDir = mkdtempSync(join(resolve(import.meta.dir, "../../../.tmp",), "llra-tickets-",),);
},);

afterEach(async () => {
  rmSync(ticketsDir, { recursive: true, force: true, },);
  await destroyTestDb(fixture,);
},);

async function insertToken(scope: AgentTokenScope,): Promise<string> {
  const { raw, hash, } = mintAgentToken();
  await db.insertInto("agent_tokens",).values({
    id: crypto.randomUUID(),
    token_hash: hash,
    scope,
  },).execute();

  return raw;
}

function makeApp(): Elysia {
  return new Elysia({ name: `test-agent-tickets-${crypto.randomUUID()}`, },).use(ticketRoutes({
    database: db,
    perTokenLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 200, },),
    globalLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 200, },),
    ticketsDir,
  }, PREFIX,),);
}

function post(app: Elysia, op: Op, body: object, raw?: string,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${PREFIX}/agent/tickets/${op}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(raw === undefined ? {} : { authorization: `Bearer ${raw}`, }),
      },
      body: JSON.stringify(body,),
    },),
  );
}

/** Scores 5/5: summary + criteria + cross-ref + implementation + gotchas. */
function validTicket(slug: string, extra = "", status = "Not Started",): string {
  return `# TASK: ${slug}

**Summary:** A concise statement of the work.

**Status:** ${status}

**Context:** See src/agent/api/tickets.ts and epic-recursive-self-improvement.

**Acceptance Criteria:**
- [ ] Returns at least 3 results within 500ms.
${extra}
**Implementation:** Use the shared helper.

**Notes / Verification:** Run bun test on the new suite.
`;
}

function bodyFor(op: Op, slug = "TASK-lane-test",): object {
  if (op === "open") { return { slug, markdown: validTicket(slug,), }; }
  if (op === "close") { return { slug, resolution: "Fixed in the lane", reference: "abcdef1", }; }
  return { slug, body: "a useful note", };
}

async function open(slug: string, raw: string, extra = "", status = "Not Started",): Promise<Response> {
  return post(makeApp(), "open", { slug, markdown: validTicket(slug, extra, status,), }, raw,);
}

async function auditRows(slug: string,) {
  return db
    .selectFrom("agent_actions",)
    .select(["action", "result", "metadata",],)
    .where(sqlTicketId(), "=", slug,)
    .execute();
}

/** Raw SQL comparison avoids depending on the audit row's guard sibling. */
function sqlTicketId() {
  // Kysely's sql tag is imported lazily to keep this helper local to the test.
  return sql`json_extract(metadata, '$.ticketId')`;
}

describe("ticket route guards — every entry point is server-side", () => {
  for (const op of ["open", "close", "comment",] as const) {
    test(`${op}: missing token is 401`, async () => {
      const res = await post(makeApp(), op, bodyFor(op,),);
      expect(res.status,).toBe(401,);
    });

    test(`${op}: wrong scope token is 403`, async () => {
      const raw = await insertToken(AgentTokenScope.Worktree,);
      const res = await post(makeApp(), op, bodyFor(op,), raw,);
      expect(res.status,).toBe(403,);
    });
  }

  test("an unknown token is 401", async () => {
    const res = await post(makeApp(), "open", bodyFor("open",), `llra_${crypto.randomUUID()}`,);
    expect(res.status,).toBe(401,);
  });

  test("an agent:tickets token is minted and accepted", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    const res = await post(makeApp(), "open", bodyFor("open",), raw,);
    expect(res.status,).toBe(201,);
  });
});

describe("ticket open", () => {
  test("a valid briefing writes only the ticket markdown", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    const slug = "TASK-open-happy";
    const res = await open(slug, raw,);
    expect(res.status,).toBe(201,);
    const body = await res.json() as { data: { score: number; slug: string } };
    expect(body.data.slug,).toBe(slug,);
    expect(body.data.score,).toBeGreaterThanOrEqual(MIN_TICKET_SCORE,);
    expect(readdirSync(ticketsDir,),).toEqual([`${slug}.md`,],);
    expect(readFileSync(join(ticketsDir, `${slug}.md`,), "utf8",),).toContain(slug,);
  });

  test("a low-score ticket is rejected with the scorer suggestions", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    const slug = "TASK-low-score";
    const res = await post(makeApp(), "open", {
      slug,
      markdown: "# TASK: bad\n\n**Summary:** (none captured)\n",
    }, raw,);

    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string; data: { score: number; suggestions: string[] } };
    expect(body.data.score,).toBeLessThan(MIN_TICKET_SCORE,);
    expect(body.data.suggestions.length,).toBeGreaterThan(0,);
    expect(body.error,).toContain(body.data.suggestions[0]!,);
    expect(readdirSync(ticketsDir,),).toEqual([],);
  });

  test("open never spawns a git or issue subprocess (orphan-issue regression)", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    const original = Bun.spawn;
    let calls = 0;
    (Bun as unknown as { spawn: unknown }).spawn = (...args: unknown[]) => {
      calls += 1;
      return (original as (...a: unknown[]) => unknown)(...args,);
    };

    try {
      const res = await open("TASK-no-orphan", raw,);
      expect(res.status,).toBe(201,);
      expect(calls,).toBe(0,);
      const row = (await res.json()) as { data: Record<string, unknown> };
      expect("gitIssue" in row.data,).toBe(false,);
      expect("issueId" in row.data,).toBe(false,);
    } finally {
      (Bun as unknown as { spawn: unknown }).spawn = original;
    }
  });

  test("a duplicate slug is rejected", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-dup", raw,);
    expect((await open("TASK-dup", raw,)).status,).toBe(409,);
  });
});

describe("ticket close", () => {
  test("close without a resolution note is rejected", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-no-note", raw,);
    const res = await post(makeApp(), "close", {
      slug: "TASK-no-note",
      resolution: "   ",
      reference: "abcdef1",
    }, raw,);

    expect(res.status,).toBe(400,);
  });

  test("close without a linked commit/PR is rejected", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-no-ref", raw,);
    const res = await post(makeApp(), "close", {
      slug: "TASK-no-ref",
      resolution: "Fixed",
      reference: "not-a-reference",
    }, raw,);

    expect(res.status,).toBe(400,);
  });

  test("close of another agent's ticket is rejected", async () => {
    const owner = await insertToken(AgentTokenScope.Tickets,);
    const other = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-owned", owner,);
    expect((await post(makeApp(), "close", bodyFor("close", "TASK-owned",), other,)).status,).toBe(403,);
    expect((await post(makeApp(), "comment", bodyFor("comment", "TASK-owned",), other,)).status,).toBe(403,);
  });

  test("a Blocked ticket cannot be closed", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-blocked", raw, "", "Blocked",);
    const res = await post(makeApp(), "close", bodyFor("close", "TASK-blocked",), raw,);
    expect(res.status,).toBe(409,);
  });

  test("a ticket with open blockers cannot be closed", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-blockers", raw, "\n**Depends on:** BUG-other must land first\n",);
    const res = await post(makeApp(), "close", bodyFor("close", "TASK-blockers",), raw,);
    expect(res.status,).toBe(409,);
  });

  test("the owner closes with status Done and a resolution", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-close-happy", raw,);
    const res = await post(makeApp(), "close", bodyFor("close", "TASK-close-happy",), raw,);
    expect(res.status,).toBe(200,);
    const text = readFileSync(join(ticketsDir, "TASK-close-happy.md",), "utf8",);
    expect(text,).toContain("**Status:** Done",);
    expect(text,).toContain("Fixed in the lane",);
    expect(text,).toContain("abcdef1",);
  });
});

describe("ticket comment", () => {
  test("an empty comment body is rejected", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-empty-comment", raw,);
    const res = await post(makeApp(), "comment", { slug: "TASK-empty-comment", body: "   ", }, raw,);
    expect(res.status,).toBe(400,);
  });

  test("the owner comment is appended to the file", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    await open("TASK-comment-happy", raw,);
    const res = await post(makeApp(), "comment", bodyFor("comment", "TASK-comment-happy",), raw,);
    expect(res.status,).toBe(200,);
    expect(readFileSync(join(ticketsDir, "TASK-comment-happy.md",), "utf8",),).toContain("a useful note",);
  });
});

describe("agent_actions audit trail", () => {
  test("every op and every rejection carries the ticket id and result", async () => {
    const raw = await insertToken(AgentTokenScope.Tickets,);
    const slug = "TASK-audit";
    await open(slug, raw,);
    expect((await post(makeApp(), "close", bodyFor("close", slug,), raw,)).status,).toBe(200,);
    expect((await post(makeApp(), "comment", bodyFor("comment", slug,), raw,)).status,).toBe(200,);
    await post(makeApp(), "close", { slug, resolution: " ", reference: "abcdef1", }, raw,);

    const rows = await auditRows(slug,);
    const results = rows.map((row,) => `${row.action}:${row.result}`);
    expect(results,).toContain("tickets_open:success",);
    expect(results,).toContain("tickets_close:success",);
    expect(results,).toContain("tickets_comment:success",);
    expect(results,).toContain("tickets_close:rejected",);
  });
});
