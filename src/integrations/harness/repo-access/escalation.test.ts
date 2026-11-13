// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// repo-access/escalation.test.ts — the escalation audit queue: a request is
// recorded and denied, an admin decision is APPENDED, and an approval grants
// exactly ONE root change (no auto-approve for any principal).
//
// Resource contract (parallel-safe): one :memory: SQLite per test via
// createTestDb, a fresh limiter per test (the process-wide governance
// limiter is never touched), the repo-access settings singleton reset in
// beforeEach AND afterEach, unique principals per test; no ports, no env,
// no sleeps, no ordering dependence. The concurrency cases use an EXPLICIT
// barrier (a Kysely plugin), never a sleep.
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { type Kysely, type KyselyPlugin, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../../db/schema";
import { principalKind, } from "../../../middleware/principal-kind";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  type EscalationRateLimiter,
  requestRepoRootChange,
} from "./escalation";
import { listPendingEscalations, resolveEscalation, } from "./escalation-queue";
import { REPO_ACCESS_ESCALATION_TOOL, } from "./escalation-rows";
import { type RepoAccessPrincipal, } from "./principal-scope";
import { initRepoAccessSettings, resetRepoAccessSettings, } from "./settings";

let fixture: TestDb;
let db: Kysely<DB>;

/** A limiter that always lets the request through (the default path). */
const allowAll: EscalationRateLimiter = { consume: () => ({ allowed: true, }), };

/** A limiter that always refuses (the rate-limited path). */
const denyAll: EscalationRateLimiter = { consume: () => ({ allowed: false, retryAfterSec: 60, }), };

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  initRepoAccessSettings({ enabled: true, },);
},);

afterEach(async () => {
  resetRepoAccessSettings();
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
async function escalationRows(): Promise<
  Array<{ id: string; verdict: string; escalation_attempt: number; tags: string }>
> {
  return await db
    .selectFrom("tool_call_audit",)
    .select(["id", "verdict", "escalation_attempt", "tags",],)
    .where("tool", "=", REPO_ACCESS_ESCALATION_TOOL,)
    .execute();
}

/**
 * A Kysely plugin that holds every query result until `parties` of them have
 * arrived — the explicit barrier that makes a race deterministic: both
 * callers have READ the approval before either of them writes.
 * @param parties - how many query results must arrive before the gate opens
 * @returns the plugin
 */
function barrierPlugin(parties: number,): KyselyPlugin {
  let arrived = 0;
  const { promise: gate, resolve: open, } = Promise.withResolvers<void>();

  return {
    transformQuery: (args,) => args.node,
    transformResult: async (args,) => {
      arrived += 1;
      if (arrived >= parties) { open(); }
      await gate;

      return args.result;
    },
  };
}

/**
 * Make every insert of one marker fail, the way a broken audit write does.
 * @param marker - the row marker whose insert must fail
 */
async function failInsertsFor(marker: string,): Promise<void> {
  fixture.sqlite.run(
    `CREATE TRIGGER fail_${marker} BEFORE INSERT ON tool_call_audit
      WHEN NEW.tags LIKE '%"marker":"${marker}"%'
      BEGIN SELECT RAISE(ABORT, 'audit write failed'); END`,
  );
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

  it("refuses the request while the repo-access tier is disabled", async () => {
    initRepoAccessSettings({ enabled: false, },);

    const outcome = await requestRepoRootChange({
      principal: principal("user",),
      targetPath: "/etc",
      db,
      limiter: allowAll,
    },);

    expect(outcome.ok === false && outcome.code,).toBe("repo_access_disabled",);
    expect(await escalationRows(),).toHaveLength(0,);
    expect(await listPendingEscalations(db,),).toHaveLength(0,);
  });

  it("refuses a principal that carries no identity at all", async () => {
    const outcome = await requestRepoRootChange({
      principal: { kind: principalKind("user",), userId: null, },
      targetPath: "/etc",
      db,
      limiter: allowAll,
    },);

    expect(outcome.ok,).toBe(false,);
    expect(outcome.ok === false && outcome.code,).toBe("escalation_denied",);
    expect(await escalationRows(),).toHaveLength(0,);
    expect(await listPendingEscalations(db,),).toHaveLength(0,);
  });

  it("denies the request instead of throwing when the audit write fails", async () => {
    await failInsertsFor("request",);

    const outcome = await requestRepoRootChange({
      principal: principal("user",),
      targetPath: "/etc",
      db,
      limiter: allowAll,
    },);

    expect(outcome.ok,).toBe(false,);
    expect(outcome.ok === false && outcome.code,).toBe("escalation_denied",);
    expect(await escalationRows(),).toHaveLength(0,);
  });

  it("denies a request when the queue holds a corrupt row", async () => {
    const subject = principal("user",);
    await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);

    await db
      .insertInto("tool_call_audit",)
      .values({
        id: randomUUID().replaceAll("-", "",),
        tool: REPO_ACCESS_ESCALATION_TOOL,
        chat_id: "",
        user_id: subject.userId ?? "",
        verdict: "reviewed",
        rationale: "corrupt row",
        escalation_attempt: 0,
        required_role: null,
        tags: "{not json",
        duration_ms: 0,
      },)
      .execute();

    const outcome = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);

    expect(outcome.ok,).toBe(false,);
    expect(await listPendingEscalations(db,),).toHaveLength(1,);
  });
});

describe("the credential-scoped key", () => {
  it("does not let one credential of a user redeem another credential's approval", async () => {
    const userId = "u-shared";
    const credA: RepoAccessPrincipal = { kind: principalKind("user",), userId, credentialId: "cred-a", };
    const credB: RepoAccessPrincipal = { kind: principalKind("user",), userId, credentialId: "cred-b", };

    const request = await requestRepoRootChange({ principal: credA, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";
    await resolveEscalation(db, { id: requestId, decision: "approve", adminId: "admin-1", },);

    const other = await requestRepoRootChange({ principal: credB, targetPath: "/etc", db, limiter: allowAll, },);
    const rows = await escalationRows();

    expect(other.ok,).toBe(false,);
    expect(rows.filter((row,) => row.verdict === "allowed"),).toHaveLength(0,);
  });

  it("does not let a sibling agent redeem another agent's approval", async () => {
    const issuer = "admin-1";
    const agent1: RepoAccessPrincipal = {
      kind: principalKind("external-agent",),
      userId: issuer,
      credentialId: "cred-1",
      agentWorktree: "/repo/tree/agent-1",
    };

    const agent2: RepoAccessPrincipal = {
      kind: principalKind("external-agent",),
      userId: issuer,
      credentialId: "cred-2",
      agentWorktree: "/repo/tree/agent-2",
    };

    const request = await requestRepoRootChange({ principal: agent1, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";
    await resolveEscalation(db, { id: requestId, decision: "approve", adminId: issuer, },);

    const sibling = await requestRepoRootChange({ principal: agent2, targetPath: "/etc", db, limiter: allowAll, },);
    const rows = await escalationRows();

    expect(sibling.ok,).toBe(false,);
    expect(rows.filter((row,) => row.verdict === "allowed"),).toHaveLength(0,);
  });

  it("lists one pending request per credential-scoped identity", async () => {
    const userId = "u-shared";
    const credA: RepoAccessPrincipal = { kind: principalKind("user",), userId, credentialId: "cred-a", };
    const credB: RepoAccessPrincipal = { kind: principalKind("user",), userId, credentialId: "cred-b", };

    await requestRepoRootChange({ principal: credA, targetPath: "/etc", db, limiter: allowAll, },);
    await requestRepoRootChange({ principal: credB, targetPath: "/etc", db, limiter: allowAll, },);

    expect(await listPendingEscalations(db,),).toHaveLength(2,);
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

  it("grants ONE root change to a concurrent pair of redemptions", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";
    await resolveEscalation(db, { id: requestId, decision: "approve", adminId: "admin-1", },);

    const racing = db.withPlugin(barrierPlugin(2,),);
    const outcomes = await Promise.all([
      requestRepoRootChange({ principal: subject, targetPath: "/etc", db: racing, limiter: allowAll, },),
      requestRepoRootChange({ principal: subject, targetPath: "/etc", db: racing, limiter: allowAll, },),
    ],);

    expect(outcomes.filter((outcome,) => outcome.ok),).toHaveLength(1,);
    const rows = await escalationRows();
    expect(rows.filter((row,) => row.verdict === "allowed"),).toHaveLength(1,);
  });

  it("denies the root change when the consumption row cannot be written", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";
    await resolveEscalation(db, { id: requestId, decision: "approve", adminId: "admin-1", },);
    await failInsertsFor("used",);

    const outcome = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const rows = await escalationRows();

    expect(outcome.ok,).toBe(false,);
    expect(outcome.ok === false && outcome.code,).toBe("escalation_denied",);
    expect(rows.filter((row,) => row.verdict === "allowed"),).toHaveLength(0,);
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

  it("reports a failed decision write instead of claiming success", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";
    await failInsertsFor("decision",);

    const decision = await resolveEscalation(db, { id: requestId, decision: "approve", adminId: "admin-1", },);

    expect(decision.ok,).toBe(false,);
    expect(decision.ok === false && decision.code,).toBe("write_failed",);
    expect(await listPendingEscalations(db,),).toHaveLength(1,);
  });

  it("lets only one of two concurrent admins decide the same request", async () => {
    const subject = principal("user",);
    const request = await requestRepoRootChange({ principal: subject, targetPath: "/etc", db, limiter: allowAll, },);
    const requestId = request.ok === false ? (request.requestId ?? "") : "";

    const racing = db.withPlugin(barrierPlugin(2,),);
    const decisions = await Promise.all([
      resolveEscalation(racing, { id: requestId, decision: "approve", adminId: "admin-1", },),
      resolveEscalation(racing, { id: requestId, decision: "deny", adminId: "admin-2", },),
    ],);

    expect(decisions.filter((decision,) => decision.ok),).toHaveLength(1,);
    const refused = decisions.filter((decision,) => !decision.ok);
    expect(refused[0]?.ok === false && refused[0]?.code,).toBe("already_decided",);
  });
});
