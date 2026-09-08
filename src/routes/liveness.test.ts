// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for liveness/readiness probes.
 *
 * Both probes are opt-in via config.observability.health.{liveness,readiness}.
 * When disabled (default), the routes are unmounted and return 404. When
 * enabled, `/health/live` returns 200 without DB access and `/health/ready`
 * returns 200 (DB ok) or 503 (DB unreachable).
 *
 * Readiness uses a real in-memory Kysely/SQLite instance for the happy path
 * (matches the runtime query surface) and a stub whose `executeQuery` rejects
 * for the failure path. Liveness-only cases pass a hollow object since the
 * probe never touches it.
 */
import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, } from "kysely";
import type { Config, ObservabilityConfig, } from "../config/schema";
import { createSqliteDialect, } from "../db";
import type { Db, } from "../db";
import type { DB, } from "../db/schema";
import { livenessRoutes, } from "./liveness";

interface HealthOverrides {
  liveness?: boolean;
  readiness?: boolean;
}

/** Minimal config with observability defaults; probes flipped via override. */
function configWith(health: HealthOverrides = {},): Config {
  const observability: ObservabilityConfig = {
    health: {
      liveness: health.liveness ?? false,
      readiness: health.readiness ?? false,
    },
    metrics: { enabled: false, },
  };
  return { observability, } as Config;
}

/** Real in-memory Kysely instance — exercises the actual query surface. */
function makeDb(): Kysely<DB> {
  const sqlite = new Database(":memory:",);
  return new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
}

/** Stub whose `executeQuery` always rejects — simulates an unreachable DB. */
function makeFailingDb(): Db {
  return {
    executeQuery: () => Promise.reject(new Error("db unreachable",),),
  } as unknown as Db;
}

describe("livenessRoutes", () => {
  test("disabled by default: /health/live returns 404", async () => {
    const app = livenessRoutes({ database: {} as never, config: configWith(), },);
    const res = await app.handle(new Request("http://localhost/health/live",),);
    expect(res.status,).toBe(404,);
  });

  test("disabled by default: /health/ready returns 404", async () => {
    const app = livenessRoutes({ database: {} as never, config: configWith(), },);
    const res = await app.handle(new Request("http://localhost/health/ready",),);
    expect(res.status,).toBe(404,);
  });

  test("liveness enabled: /health/live returns 200 with uptime + timestamp", async () => {
    const app = livenessRoutes({
      database: {} as never,
      config: configWith({ liveness: true, },),
    },);
    const res = await app.handle(new Request("http://localhost/health/live",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status,).toBe("ok",);
    expect(Number.isInteger(body.uptime,),).toBe(true,);
    const ts = body.timestamp as string;
    expect(new Date(ts,).toISOString(),).toBe(ts,);
  });

  test("liveness enabled does not mount readiness", async () => {
    const app = livenessRoutes({
      database: {} as never,
      config: configWith({ liveness: true, },),
    },);
    const res = await app.handle(new Request("http://localhost/health/ready",),);
    expect(res.status,).toBe(404,);
  });

  test("readiness enabled with reachable DB returns 200", async () => {
    const db = makeDb();
    try {
      const app = livenessRoutes({
        database: db,
        config: configWith({ readiness: true, },),
      },);
      const res = await app.handle(new Request("http://localhost/health/ready",),);
      expect(res.status,).toBe(200,);
      const body = (await res.json()) as { status: string; checks: { database: string } };
      expect(body.status,).toBe("ok",);
      expect(body.checks.database,).toBe("ok",);
    } finally {
      await db.destroy();
    }
  });

  test("readiness enabled with unreachable DB returns 503", async () => {
    const db = makeFailingDb();
    const app = livenessRoutes({
      database: db,
      config: configWith({ readiness: true, },),
    },);
    const res = await app.handle(new Request("http://localhost/health/ready",),);
    expect(res.status,).toBe(503,);
  });

  test("routes compose onto a parent Elysia app without conflict", async () => {
    const db = makeDb();
    try {
      const app = new Elysia().use(
        livenessRoutes({
          database: db,
          config: configWith({ liveness: true, readiness: true, },),
        },),
      );
      const live = await app.handle(new Request("http://localhost/health/live",),);
      expect(live.status,).toBe(200,);
      const ready = await app.handle(new Request("http://localhost/health/ready",),);
      expect(ready.status,).toBe(200,);
    } finally {
      await db.destroy();
    }
  });
});
