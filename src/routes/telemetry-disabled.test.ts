/**
 * Tests for telemetry routes with telemetry disabled.
 *
 * Uses `mock.module` to stub the telemetry service so the route-level
 * disabled-flag branches are exercised (dropped event, analytics 404).
 * Requires `--isolate` (suite default) — the mock leaks to other files otherwise.
 */
import type { Database, } from "bun:sqlite";
import { mock,  afterAll, beforeAll, describe, expect, test} from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { telemetryRoutes, } from "./telemetry";

mock.module("../telemetry/service", () => ({
  record: async () => {},
  isTelemetryEnabled: () => false,
  isFrontendTelemetryEnabled: () => false,
  getRetentionDays: () => 90,
}),);

function makeApp(db: Kysely<DB>, userId: string, userRole: string,) {
  const app = new Elysia({ name: "test-telemetry-disabled", },);
  app.derive(() => ({ userId, userRole, }));
  return app.use(telemetryRoutes({ database: db, },),);
}

describe("telemetry routes — disabled", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "admin", "Admin", { id: "admin" as never, },);
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("POST /telemetry/event drops when frontend telemetry disabled", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ type: "frontend.page_view", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok?: boolean; dropped?: string };
    expect(body.ok,).toBe(true,);
    expect(body.dropped,).toBe("frontend telemetry disabled",);

    const rows = await db
      .selectFrom("telemetry_events",)
      .select("id",)
      .execute();
    expect(rows,).toHaveLength(0,);
  });

  test("GET analytics/summary returns 404 when telemetry disabled", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/summary",),
    );
    expect(res.status,).toBe(404,);
    const body = await res.json() as { error?: string };
    expect(body.error,).toContain("disabled",);
  });

  test("GET analytics/models returns 404 when telemetry disabled", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/models",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET analytics/errors returns 404 when telemetry disabled", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/errors",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET analytics/daily returns 404 when telemetry disabled", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/daily",),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE analytics/purge still requires admin", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/analytics/purge", { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });
});
