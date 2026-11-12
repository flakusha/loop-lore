// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin SD status routes.
 *
 * Verifies:
 *   - 401 when no userId (anonymous)
 *   - 403 when user lacks admin.system
 *   - 200 for admin with default port
 *   - 200 for admin with custom configured port
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { saveSdCppSetup, } from "../../generation/image-engine/sdcpp-setup";
import { createTestDb, } from "../../test-utils/create-test-db";
import { sdStatusRoutes, } from "./sd-status";

/**
 * @param db
 * @param userRole
 * @param config
 * @param userId
 */
function makeApp(
  db: Kysely<DB>,
  userRole: string | null,
  config: Config,
  userId: string | null = userRole ? `test-user-${userRole}` : null,
) {
  const app = new Elysia({ name: "test-sd-status", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId,
    userRole,
  }));

  return app.use(sdStatusRoutes({ database: db, config, }, "/api",),);
}

describe("admin sd-status routes", () => {
  test("GET /api/admin/sd-status returns 401 for anonymous", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, null, {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/sd-status returns 403 for non-admin", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "user", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/sd-status returns 200 for admin with default port", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { status: string; port: number; latencyMs: number | null };
    // sd-cpp is not running in test env → status="stopped"; default port 9010
    expect(body.port,).toBe(9010,);
    expect(["stopped", "unknown",],).toContain(body.status,);
  });

  test("GET /api/admin/sd-status honors configured port", async () => {
    const { db, } = await createTestDb();
    const config = {
      generation: { autoStart: { sdCpp: { port: 7777, }, }, },
    } as unknown as Config;

    const app = makeApp(db, "admin", config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { port: number };
    expect(body.port,).toBe(7777,);
  });

  test("GET /api/admin/sd-status returns 403 for moderator (lacks admin.system)", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "moderator", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(403,);
  });
});

describe("admin sd-status sdcpp discovery sweep", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  },);

  test("returns 401 for anonymous and 403 for non-admin", async () => {
    const { db, } = await createTestDb();
    const anonymous = makeApp(db, null, {} as Config,);
    expect(
      (await anonymous.handle(new Request("http://localhost/api/admin/sd-status/sdcpp",),)).status,
    ).toBe(401,);

    const plain = makeApp(db, "user", {} as Config,);
    expect(
      (await plain.handle(new Request("http://localhost/api/admin/sd-status/sdcpp",),)).status,
    ).toBe(403,);
  });

  test("answers an empty sweep when nothing is configured", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/sdcpp",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { probedAt: string; providers: unknown[] };
    expect(body.providers,).toEqual([],);
    expect(typeof body.probedAt,).toBe("string",);
  });

  test("probes a config sdcpp provider and reports the structured unreachable reason", async () => {
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error("connection refused",);
    };

    const config = {
      generation: {
        providers: {
          sd: [{
            name: "local",
            label: "Local",
            baseUrl: "http://127.0.0.1:9010",
            apiFamily: "sdcpp",
            defaults: {},
            timeout: 250,
            generationTimeout: 250,
          },],
        },
      },
    } as unknown as Config;

    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/sdcpp",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: { name: string; source: string; dispatching: boolean; reachable: boolean; reason: string }[];
    };

    expect(body.providers,).toHaveLength(1,);
    expect(body.providers[0]!.name,).toBe("local",);
    expect(body.providers[0]!.source,).toBe("config",);
    expect(body.providers[0]!.dispatching,).toBe(true,);
    expect(body.providers[0]!.reachable,).toBe(false,);
    expect(body.providers[0]!.reason,).toBe("unreachable",);
  });

  test("probes a reachable instance with version, state and models", async () => {
    globalThis.fetch = (async (url: string | URL | Request,) => {
      expect(String(url,),).toBe("http://127.0.0.1:9010/sdcpp/v1/capabilities",);
      return Response.json({
        version: "ci-build",
        runtime: { state: "ready", models: { diffusion_model: "checkpoints/x.gguf", }, },
      },);
    }) as typeof fetch;

    const config = {
      generation: {
        providers: {
          sd: [{
            name: "local",
            label: "Local",
            baseUrl: "http://127.0.0.1:9010",
            apiFamily: "sdcpp",
            defaults: {},
            timeout: 250,
            generationTimeout: 250,
          },],
        },
      },
    } as unknown as Config;

    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/sdcpp",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: {
        reachable: boolean;
        version?: string;
        state?: string;
        models?: string[];
        latencyMs?: number;
      }[];
    };

    expect(body.providers[0]!.reachable,).toBe(true,);
    expect(body.providers[0]!.version,).toBe("ci-build",);
    expect(body.providers[0]!.state,).toBe("ready",);
    expect(body.providers[0]!.models,).toEqual(["checkpoints/x.gguf",],);
    expect(body.providers[0]!.latencyMs,).toBeGreaterThanOrEqual(0,);
  });

  test("includes a stored setup as a stored candidate that is not dispatching", async () => {
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error("down",);
    };

    const { db, } = await createTestDb();
    await saveSdCppSetup(db, { name: "stored-one", baseUrl: "http://127.0.0.1:9010", },);

    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/sdcpp",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: { name: string; source: string; dispatching: boolean; reachable: boolean }[];
    };

    expect(body.providers,).toHaveLength(1,);
    expect(body.providers[0]!.name,).toBe("stored-one",);
    expect(body.providers[0]!.source,).toBe("stored",);
    expect(body.providers[0]!.dispatching,).toBe(false,);
    expect(body.providers[0]!.reachable,).toBe(false,);
  });

  test("adds the auto-start instance when enabled and not otherwise covered", async () => {
    globalThis.fetch = (async (url: string | URL | Request,) => {
      expect(String(url,),).toBe("http://127.0.0.1:9010/sdcpp/v1/capabilities",);
      return Response.json({},);
    }) as typeof fetch;

    const config = {
      generation: { autoStart: { sdCpp: { enabled: true, port: 9010, modelType: "checkpoint", modelPath: "/m", }, }, },
    } as unknown as Config;

    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/sdcpp",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: { name: string; source: string; dispatching: boolean; reachable: boolean }[];
    };

    expect(body.providers,).toHaveLength(1,);
    expect(body.providers[0]!.name,).toBe("auto-start",);
    expect(body.providers[0]!.source,).toBe("auto-start",);
    expect(body.providers[0]!.dispatching,).toBe(false,);
    expect(body.providers[0]!.reachable,).toBe(true,);
  });
});
