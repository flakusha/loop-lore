// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Route tests for the harness escalation audit queue: the admin guard denies
 * non-admins, the list shows the recorded root-change requests, and
 * approve/deny round-trip the queue's decisions.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per test via
 * createTestDb, a fresh limiter per test (the process-wide governance limiter
 * is never touched), unique principals per test; no ports, no env, no sleeps.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import {
  type EscalationRateLimiter,
  requestRepoRootChange,
} from "../../integrations/harness/repo-access";
import { principalKind, } from "../../middleware/principal-kind";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { harnessEscalationRoutes, } from "./escalations";

let fixture: TestDb;
let db: Kysely<DB>;

/** A limiter that always lets the request through (the default path). */
const allowAll: EscalationRateLimiter = { consume: () => ({ allowed: true, }), };

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/** Mount the routes on a fresh app with a fixed role. */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "admin-1", userRole: role, }))
    .use(harnessEscalationRoutes({ database: db, },),);

  return built as unknown as Elysia;
}

/** Hit a path on a freshly mounted app. */
function hit(role: string | null, method: string, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`, { method, },),);
}

/** Record one root-change request and return its queue id. */
async function recordRequest(): Promise<string> {
  const outcome = await requestRepoRootChange({
    principal: { kind: principalKind("user",), userId: `u-${randomUUID()}`, },
    targetPath: "/etc",
    db,
    limiter: allowAll,
  },);

  return outcome.ok === false ? (outcome.requestId ?? "") : "";
}

describe("harnessEscalationRoutes", () => {
  it("denies a non-admin with 403", async () => {
    const res = await hit(UserRole.User, "GET", "/api/v1/harness/escalations",);
    expect(res.status,).toBe(403,);
  });

  it("lists an empty queue for an admin", async () => {
    const res = await hit(UserRole.Admin, "GET", "/api/v1/harness/escalations",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { items: unknown[] };
    expect(body.items,).toEqual([],);
  });

  it("lists a recorded request and clears it on approve", async () => {
    const id = await recordRequest();

    const listed = await hit(UserRole.Admin, "GET", "/api/v1/harness/escalations",);
    const body = await listed.json() as { items: Array<{ id: string; targetPath: string }> };
    expect(body.items,).toHaveLength(1,);
    expect(body.items[0]?.targetPath,).toBe("/etc",);

    const approved = await hit(UserRole.Admin, "POST", `/api/v1/harness/escalations/${id}/approve`,);
    expect(approved.status,).toBe(200,);

    const after = await hit(UserRole.Admin, "GET", "/api/v1/harness/escalations",);
    const afterBody = await after.json() as { items: unknown[] };
    expect(afterBody.items,).toEqual([],);
  });

  it("answers 404 for an unknown request id", async () => {
    const res = await hit(UserRole.Admin, "POST", `/api/v1/harness/escalations/${randomUUID()}/approve`,);
    expect(res.status,).toBe(404,);
  });

  it("answers 409 when the request was already decided", async () => {
    const id = await recordRequest();
    const denied = await hit(UserRole.Admin, "POST", `/api/v1/harness/escalations/${id}/deny`,);
    expect(denied.status,).toBe(200,);
    const again = await hit(UserRole.Admin, "POST", `/api/v1/harness/escalations/${id}/approve`,);
    expect(again.status,).toBe(409,);
  });
});
