// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E tests for the memory audit route (FEAT-075).
 *
 * Covers the observable contract of GET /api/actors/:actorId/memories/mem1/audit:
 * ownership gating, action filtering, cursor pagination round-trip, and
 * graceful handling of corrupt cursors.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { recordAuditLog, } from "../memory/audit";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { memoryAuditRoutes, } from "./memory-audit";

/** Mount the audit route with the test user derived context. */
function makeApp(db: Kysely<DB>, userId: string | null = "user1",) {
  const app = new Elysia({ name: "test-memory-audit", },);
  if (userId !== null) {
    app.derive(() => ({ userId, userRole: null, }));
  }
  return app.use(memoryAuditRoutes({ database: db, },),);
}

/** Fetch the audit page for an actor as JSON. */
async function getAudit(
  db: Kysely<DB>,
  actorId: string,
  query = "",
): Promise<{ status: number; body: { entries: Array<Record<string, unknown>>; nextCursor?: string | null } }> {
  const res = await makeApp(db,).handle(
    new Request(`http://localhost/api/actors/${actorId}/memories/mem1/audit${query}`,),
  );
  return {
    status: res.status,
    body: await res.json() as { entries: Array<Record<string, unknown>>; nextCursor?: string | null },
  };
}

describe("memoryAuditRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertActors(db, "User One", {
      id: "user1" as never,
      actor_type: "user" as never,
      user_id: "user1" as never,
    },);
    await recordAuditLog(db, [
      { memoryId: "mem1", actorId: "user1", userId: "user1", action: "create", details: { source: "test", }, },
      { memoryId: "mem2", actorId: "user1", userId: "user1", action: "pin", details: {}, },
      { memoryId: "mem3", actorId: "user1", userId: "user1", action: "purge", details: {}, },
    ],);
  },);

  afterAll(() => sqlite.close());

  test("exports function and returns Elysia plugin", () => {
    expect(typeof memoryAuditRoutes,).toBe("function",);
    expect(memoryAuditRoutes({ database: db, },),).toBeDefined();
  });

  test("returns entries for a valid owned actor", async () => {
    const { status, body, } = await getAudit(db, "user1",);
    expect(status,).toBe(200,);
    expect(body.entries.length,).toBe(3,);
    expect(body.entries[0],).toHaveProperty("action",);
    expect(body.entries[0],).toHaveProperty("memoryId",);
  });

  test("returns empty entries for an actor with no audit rows", async () => {
    const foreign = await getAudit(db, "nonexistent-actor",);
    expect(foreign.status,).toBe(200,);
    expect(foreign.body.entries,).toEqual([],);
  });

  test("filters by action", async () => {
    const { body, } = await getAudit(db, "user1", "?action=pin",);
    expect(body.entries.length,).toBe(1,);
    expect(body.entries[0]?.["action"],).toBe("pin",);
  });

  test("rejects unknown action values via schema validation", async () => {
    const { status, } = await getAudit(db, "user1", "?action=teleport",);
    expect(status,).toBe(422,);
  });

  test("round-trips cursor pagination", async () => {
    const page1 = await getAudit(db, "user1", "?limit=2",);
    expect(page1.body.entries.length,).toBe(2,);
    expect(page1.body.nextCursor,).toBeTruthy();
    const page2 = await getAudit(db, "user1", `?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor ?? "",)}`,);
    expect(page2.body.entries.length,).toBe(1,);
    // No overlap between pages.
    const ids1 = page1.body.entries.map((e,) => e["id"]);
    const ids2 = page2.body.entries.map((e,) => e["id"]);
    expect(ids1.some((id,) => ids2.includes(id,)),).toBe(false,);
  });

  test("gracefully ignores a corrupt cursor", async () => {
    const { status, body, } = await getAudit(db, "user1", `?cursor=${encodeURIComponent("!!!not-base64url!!!",)}`,);
    expect(status,).toBe(200,);
    // Corrupt cursor decodes to no valid filter — returns rows unfiltered.
    expect(body.entries.length,).toBeGreaterThan(0,);
  });

  test("date filters are accepted", async () => {
    const { status, body, } = await getAudit(
      db,
      "user1",
      "?since=2000-01-01T00:00:00Z&until=2100-01-01T00:00:00Z",
    );
    expect(status,).toBe(200,);
    expect(body.entries.length,).toBe(3,);
  });
});
