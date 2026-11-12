// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the admin ComfyUI discovery sweep.
 *
 * Verifies:
 *   - 401 when no userId (anonymous), 403 without admin.system
 *   - empty sweep when nothing is configured
 *   - config comfyui provider probed with the structured unreachable reason
 *   - reachable instance reports version + devices
 *   - stored setup appears as a non-dispatching stored candidate
 *   - non-comfyui config providers are not probed
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { saveComfyUISetup, } from "../../generation/image-engine/comfyui-setup";
import { createTestDb, } from "../../test-utils/create-test-db";
import { comfyUIStatusRoutes, } from "./comfyui-status";

const originalFetch = globalThis.fetch;

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
  const app = new Elysia({ name: "test-comfyui-status", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId,
    userRole,
  }));

  return app.use(comfyUIStatusRoutes({ database: db, config, }, "/api",),);
}

const COMFY_PROVIDER_CONFIG = {
  generation: {
    providers: {
      sd: [{
        name: "local-comfy",
        label: "Local",
        baseUrl: "http://127.0.0.1:8188",
        apiFamily: "comfyui",
        defaults: {},
        timeout: 250,
        generationTimeout: 250,
      },],
    },
  },
} as unknown as Config;

afterEach(() => {
  globalThis.fetch = originalFetch;
},);

describe("admin sd-status comfyui discovery sweep", () => {
  test("returns 401 for anonymous and 403 for non-admin", async () => {
    const { db, } = await createTestDb();
    const anonymous = makeApp(db, null, {} as Config,);
    expect(
      (await anonymous.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),)).status,
    ).toBe(401,);

    const plain = makeApp(db, "user", {} as Config,);
    expect(
      (await plain.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),)).status,
    ).toBe(403,);
  });

  test("answers an empty sweep when nothing is configured", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { probedAt: string; providers: unknown[] };
    expect(body.providers,).toEqual([],);
    expect(typeof body.probedAt,).toBe("string",);
  });

  test("probes a config comfyui provider and reports the structured unreachable reason", async () => {
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error("connection refused",);
    };

    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", COMFY_PROVIDER_CONFIG,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: { name: string; source: string; dispatching: boolean; reachable: boolean; reason: string }[];
    };

    expect(body.providers,).toHaveLength(1,);
    expect(body.providers[0]!.name,).toBe("local-comfy",);
    expect(body.providers[0]!.source,).toBe("config",);
    expect(body.providers[0]!.dispatching,).toBe(true,);
    expect(body.providers[0]!.reachable,).toBe(false,);
    expect(body.providers[0]!.reason,).toBe("unreachable",);
  });

  test("probes a reachable instance with version and devices", async () => {
    globalThis.fetch = (async (url: string | URL | Request,) => {
      expect(String(url,),).toBe("http://127.0.0.1:8188/system_stats",);
      return Response.json({
        system: { comfyui_version: "0.3.45", python_version: "3.12.7", },
        devices: [{ name: "cuda:0", type: "RTX 4090", },],
      },);
    }) as typeof fetch;

    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", COMFY_PROVIDER_CONFIG,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: {
        reachable: boolean;
        version?: string;
        pythonVersion?: string;
        devices?: { name?: string; type?: string }[];
        latencyMs?: number;
      }[];
    };

    expect(body.providers[0]!.reachable,).toBe(true,);
    expect(body.providers[0]!.version,).toBe("0.3.45",);
    expect(body.providers[0]!.pythonVersion,).toBe("3.12.7",);
    expect(body.providers[0]!.devices,).toEqual([{ name: "cuda:0", type: "RTX 4090", },],);
    expect(body.providers[0]!.latencyMs,).toBeGreaterThanOrEqual(0,);
  });

  test("includes a stored setup as a stored candidate that is not dispatching", async () => {
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error("down",);
    };

    const { db, } = await createTestDb();
    await saveComfyUISetup(db, { name: "stored-comfy", baseUrl: "http://127.0.0.1:8188", },);

    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: { name: string; source: string; dispatching: boolean; reachable: boolean }[];
    };

    expect(body.providers,).toHaveLength(1,);
    expect(body.providers[0]!.name,).toBe("stored-comfy",);
    expect(body.providers[0]!.source,).toBe("stored",);
    expect(body.providers[0]!.dispatching,).toBe(false,);
    expect(body.providers[0]!.reachable,).toBe(false,);
  });

  test("a stored setup replaces a same-name config provider in the sweep", async () => {
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error("down",);
    };

    const { db, } = await createTestDb();
    await saveComfyUISetup(db, { name: "local-comfy", baseUrl: "http://127.0.0.1:9000", },);

    const app = makeApp(db, "admin", COMFY_PROVIDER_CONFIG,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      providers: { name: string; source: string; dispatching: boolean; baseUrl: string }[];
    };

    expect(body.providers,).toHaveLength(1,);
    expect(body.providers[0]!.name,).toBe("local-comfy",);
    expect(body.providers[0]!.source,).toBe("stored",);
    // The stored row replaced the config provider on the dispatch path.
    expect(body.providers[0]!.dispatching,).toBe(true,);
    expect(body.providers[0]!.baseUrl,).toBe("http://127.0.0.1:9000",);
  });

  test("does not probe non-comfyui config providers", async () => {
    let probed = 0;
    (globalThis as Record<string, unknown>).fetch = async () => {
      probed += 1;
      return Response.json({},);
    };

    const config = {
      generation: {
        providers: {
          sd: [{
            name: "sd-file",
            label: "sd-file",
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
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status/comfyui",),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { providers: unknown[] };
    expect(body.providers,).toEqual([],);
    expect(probed,).toBe(0,);
  });
});
