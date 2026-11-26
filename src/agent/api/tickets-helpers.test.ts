// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct behavior tests for the pure ticket-route helpers. The route suite
 * covers them indirectly; these pin the validation transforms and the
 * ownership/audit contract the routes rely on. Each test owns its DB fixture.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";
import { AgentTokenScope, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { type ResolvedAgentToken, } from "./auth";
import {
  auditTicketAction,
  CLOSE_ACTION,
  closeMarkdown,
  COMMENT_ACTION,
  filedBy,
  hasLinkedReference,
  hasOpenBlockers,
  OPEN_ACTION,
  readStatus,
  SLUG_RE,
} from "./tickets-helpers";

let fixture: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

function token(id = crypto.randomUUID(),): ResolvedAgentToken {
  return { id, scope: AgentTokenScope.Tickets, };
}

function bearerRequest(): Request {
  return new Request("http://localhost/api/v1/agent/tickets/open", {
    headers: { authorization: "Bearer llra-helper-test", },
  },);
}

describe("ticket slug and markdown helpers", () => {
  test("SLUG_RE accepts safe slugs and rejects traversal, spaces and overlong names", () => {
    expect(SLUG_RE.test("TASK-safe.slug-1",),).toBe(true,);
    expect(SLUG_RE.test("../TASK-escape",),).toBe(false,);
    expect(SLUG_RE.test("TASK with spaces",),).toBe(false,);
    expect(SLUG_RE.test("-TASK-leading-dash",),).toBe(false,);
    expect(SLUG_RE.test(`TASK-${"x".repeat(130,)}`,),).toBe(false,);
  });

  test("readStatus reads both header conventions and tolerates absence", () => {
    expect(readStatus("**Status:** Blocked\n",),).toBe("Blocked",);
    expect(readStatus("**Status**: In Progress\n",),).toBe("In Progress",);
    expect(readStatus("# TASK: no header\n",),).toBeNull();
  });

  test("hasOpenBlockers ignores empty/closed dependency values", () => {
    expect(hasOpenBlockers("**Depends on:** BUG-1 must land first\n",),).toBe(true,);
    expect(hasOpenBlockers("**Blockers**: BUG-9\n",),).toBe(true,);
    expect(hasOpenBlockers("**Blocked by:** none\n",),).toBe(false,);
    expect(hasOpenBlockers("**Depends on:** done\n",),).toBe(false,);
    expect(hasOpenBlockers("no dependency header\n",),).toBe(false,);
  });

  test("hasLinkedReference accepts SHAs, issue/PR numbers and pull/commit URLs", () => {
    expect(hasLinkedReference("abcdef1",),).toBe(true,);
    expect(hasLinkedReference("#123",),).toBe(true,);
    expect(hasLinkedReference("PR #123",),).toBe(true,);
    expect(hasLinkedReference("https://github.com/o/r/pull/12",),).toBe(true,);
    expect(hasLinkedReference("not-a-reference",),).toBe(false,);
  });

  test("closeMarkdown stamps either header and appends the resolution block", () => {
    const colon = closeMarkdown("**Status:** In Progress\n\nbody", "Fixed it", "abcdef1", "tok-1",);
    expect(colon,).toContain("**Status:** Done",);
    expect(colon,).toContain("Fixed it",);
    expect(colon,).toContain("**Linked reference:** abcdef1",);
    expect(colon,).toContain("Closed by agent token tok-1.",);

    const spaced = closeMarkdown("**Status**: Blocked\n", "Fixed it", "#123", "tok-2",);
    expect(spaced,).toContain("**Status**: Done",);
    expect(spaced,).toContain("**Linked reference:** #123",);
  });
});

describe("ticket audit and ownership helpers", () => {
  test("auditTicketAction records each lifecycle label with ticket metadata", async () => {
    const actor = token();
    const request = bearerRequest();
    await auditTicketAction(db, request, OPEN_ACTION, actor, "TASK-audit", "success", {
      score: 5,
    },);

    await auditTicketAction(db, request, CLOSE_ACTION, actor, "TASK-audit", "rejected", {
      reason: "blocked",
    },);

    await auditTicketAction(db, request, COMMENT_ACTION, actor, "TASK-audit", "success",);

    const rows = await db
      .selectFrom("agent_actions",)
      .select(["action", "result", "metadata",],)
      .where(sql`json_extract(metadata, '$.ticketId')`, "=", "TASK-audit",)
      .execute();

    const outcomes = rows.map((row,) => `${row.action}:${row.result}`);
    expect(outcomes,).toContain(`${OPEN_ACTION}:success`,);
    expect(outcomes,).toContain(`${CLOSE_ACTION}:rejected`,);
    expect(outcomes,).toContain(`${COMMENT_ACTION}:success`,);

    const opened = rows.find((row,) => row.action === OPEN_ACTION)!;
    expect(opened.metadata,).toContain(`"tokenId":"${actor.id}"`,);
    expect(opened.metadata,).toContain('"score":5',);
  });

  test("filedBy requires a successful open row from the same token", async () => {
    const owner = token();
    const other = token();
    const request = bearerRequest();

    expect(await filedBy(db, "TASK-owned", owner.id,),).toBe(false,);
    await auditTicketAction(db, request, OPEN_ACTION, owner, "TASK-owned", "success",);
    expect(await filedBy(db, "TASK-owned", owner.id,),).toBe(true,);
    expect(await filedBy(db, "TASK-owned", other.id,),).toBe(false,);

    await auditTicketAction(db, request, OPEN_ACTION, owner, "TASK-failed", "rejected",);
    expect(await filedBy(db, "TASK-failed", owner.id,),).toBe(false,);
  });
});
