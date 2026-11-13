// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// repo-access/escalation.test.ts — the escalation audit queue: a request is
// recorded and denied, an admin decision is APPENDED, and an approval grants
// exactly ONE root change (no auto-approve for any principal).
//
// Resource contract (parallel-safe): one :memory: SQLite per test via
// createTestDb, a fresh limiter per test (the process-wide governance
// limiter is never touched), unique principals per test; no ports, no env,
// no sleeps, no ordering dependence.
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../../db/schema";
import { principalKind, } from "../../../middleware/principal-kind";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  type EscalationRateLimiter,
  REPO_ACCESS_ESCALATION_TOOL,
  requestRepoRootChange,
} from "./escalation";
import { listPendingEscalations, resolveEscalation, } from "./escalation-queue";
import { type RepoAccessPrincipal, } from "./principal-scope";

let fixture: TestDb;
let db: Kysely<DB>;

/** A limiter that always lets the request through (the default path). */
const allowAll: EscalationRateLimiter = { consume: () => ({ allowed: true, }), };

/** A limiter that always refuses (the rate-limited path). */
const denyAll: EscalationRateLimiter = { consume: () => ({ allowed: false, retryAfterSec: 60, }), };

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/**
 * A fresh principal per test — no principal is shared between tests.
 * @param kind - the principal kind to mint
 * @returns the server-resolved principal
 */
function principal(kind: "user" | "internal-service" | "external-agent",): RepoAccessPrincipal {
  return { kind: principalKind(kind,), userId: `u-${randomUUID()}`, };
}

/**
 * The escalation rows recorded so far.
 * @returns the rows of the escalation queue's audit table
 */
async function escalationRows(): Promise<Array<{ id: string; verdict: string; escalation_attempt: number }>> {
  return await db
    .selectFrom("tool_call_audit",)
    .select(["id", "verdict", "escalation_attempt",],)
    .where("tool", "=", REPO_ACCESS_ESCALATION_TOOL,)
    .execute();
}

describe("requestRepoRootChange — recorded, default deny", () => {
  it("denies the request and records it for the admin queue", async () => {
    const outcome = await requestRepoRootChange({
      principal: principal("user",),
      targetPath: "/etc",
      db,
      limiter: allowAll,
    },);

    expect(outcome.ok,).toBe(false,);
    expect(outcome.ok === false && outcome.code,).toBe("escalation_denied",);
    expect(typeof (outcome.ok === false ? outcome.requestId : null),).toBe("string",);

    const rows = await escalationRows();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.verdict,).toBe("denied",);
    expect(rows[0]?.escalation_attempt,).toBe(1,);
  });

  it("never auto-approves, for ANY principal", async () => {
    for (const kind of ["user", "internal-service", "external-agent",] as const) {
      const outcome = await requestRepoRootChange({
        principal: principal(kind,),
        targetPath: "/etc",
        db,
        limiter: allowAll,
      },);

      expect(outcome.ok,).toBe(false,);
    }
  });

  it("re-uses the pending request instead of queueing a second one", async () => {
    const subject = principal("user",);
    const first = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const second = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);

    expect(second.ok === false ? second.requestId : null,).toBe(first.ok === false ? first.requestId : null,);
    expect(await escalationRows(),).toHaveLength(1,);
  });

  it("refuses a request over the rate limit without queueing it", async () => {
    const outcome = await requestRepoRootChange({
      principal: principal("user",),
      targetPath: "/etc",
      db,
      limiter: denyAll,
    },);

    expect(outcome.ok === false && outcome.code,).toBe("escalation_rate_limited",);
    expect(await listPendingEscalations(db,),).toHaveLength(0,);
  });
});

describe("the admin queue — list, approve, deny", () => {
  it("lists a recorded request as pending", async () => {
    const subject = principal("internal-service",);
    await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);

    const pending = await listPendingEscalations(db,);
    expect(pending,).toHaveLength(1,);
    expect(pending[0]?.targetPath,).toBe("/etc",);
    expect(String(pending[0]?.kind,),).toBe("internal-service",);
    expect(pending[0]?.subjectId,).toBe(subject.userId ?? "",);
  });

  it("appends the approval without rewriting the recorded request", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";

    const decision = await resolveEscalation(db, { id: requestId, decision: "approve", adminId: "admin-1", },);
    expect(decision.ok,).toBe(true,);

    const rows = await escalationRows();
    expect(rows,).toHaveLength(2,);
    expect(rows[0]?.verdict,).toBe("denied",);
    expect(rows[0]?.escalation_attempt,).toBe(1,);
    expect(rows[1]?.verdict,).toBe("reviewed",);
    expect(await listPendingEscalations(db,),).toHaveLength(0,);
  });

  it("grants exactly ONE root change after an approval", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";
    await resolveEscalation(db, { id: requestId, decision: "approve", adminId: "admin-1", },);

    const granted = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    expect(granted.ok,).toBe(true,);
    expect(granted.ok === true ? granted.root : null,).toBe("/etc",);

    // The approval is consumed: the next request is denied and queued again.
    const again = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    expect(again.ok,).toBe(false,);
    expect(await listPendingEscalations(db,),).toHaveLength(1,);
  });

  it("closes the request on a denial (no approval follows)", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";

    const decision = await resolveEscalation(db, { id: requestId, decision: "deny", adminId: "admin-1", },);
    expect(decision.ok,).toBe(true,);
    expect(await listPendingEscalations(db,),).toHaveLength(0,);

    const after = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    expect(after.ok,).toBe(false,);
  });

  it("refuses an unknown request id", async () => {
    const decision = await resolveEscalation(db, {
      id: `missing-${randomUUID()}`,
      decision: "approve",
      adminId: "admin-1",
    },);

    expect(decision.ok,).toBe(false,);
    expect(decision.ok === false && decision.code,).toBe("unknown_request",);
  });

  it("refuses a second decision on the same request", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";
    await resolveEscalation(db, { id: requestId, decision: "approve", adminId: "admin-1", },);

    const second = await resolveEscalation(db, { id: requestId, decision: "deny", adminId: "admin-2", },);
    expect(second.ok,).toBe(false,);
    expect(second.ok === false && second.code,).toBe("already_decided",);
  });
});
