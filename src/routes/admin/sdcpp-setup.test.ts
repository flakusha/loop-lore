// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin sd.cpp setup routes.
 *
 * Verifies:
 *   - 401 when no userId (anonymous), 403 without admin.system
 *   - 200 save persists the descriptor after a successful probe, no key material echoes
 *   - 502 when the probe fails and nothing is stored
 *   - 400 on schema violations and unknown delete targets
 *   - 204 delete removes the stored setup
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { saveSdCppSetup, } from "../../generation/image-engine/sdcpp-setup";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { sdCppSetupRoutes, } from "./sdcpp-setup";

const originalFetch = globalThis.fetch;

/** Minimal payload that passes schema validation. */
const BODY = {
  name: "local-sdcpp",
  baseUrl: "http://127.0.0.1:9010",
};

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
  const app = new Elysia({ name: "test-sdcpp-setup", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId,
    userRole,
  }));

  return app.use(sdCppSetupRoutes({ database: db, config, }, "/api",),);
}

function post(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("admin sd.cpp setup routes", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await initSmk({
      serverEncryptionKey: "f".repeat(64,),
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);
  },);

  afterAll(async () => {
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    globalThis.fetch = originalFetch;
    await db.destroy();
  },);

  beforeEach(async () => {
    globalThis.fetch = originalFetch;
    await db.deleteFrom("system_config",).execute();
  },);

  test("POST returns 401 for anonymous and 403 for non-admin", async () => {
    const anonymous = makeApp(db, null, {} as Config,);
    expect((await anonymous.handle(post("http://localhost/api/admin/sd-status/sdcpp/setup", BODY,),)).status,).toBe(
      401,
    );

    const plain = makeApp(db, "user", {} as Config,);
    expect((await plain.handle(post("http://localhost/api/admin/sd-status/sdcpp/setup", BODY,),)).status,).toBe(403,);
  });

  test("DELETE returns 401 for anonymous and 403 for non-admin", async () => {
    const anonymous = makeApp(db, null, {} as Config,);
    expect(
      (await anonymous.handle(
        new Request("http://localhost/api/admin/sd-status/sdcpp/setup/x", { method: "DELETE", },),
      )).status,
    ).toBe(401,);

    const plain = makeApp(db, "user", {} as Config,);
    expect(
      (await plain.handle(new Request("http://localhost/api/admin/sd-status/sdcpp/setup/x", { method: "DELETE", },),))
        .status,
    ).toBe(403,);
  });

  test("POST saves after a successful probe and never echoes the key", async () => {
    globalThis.fetch = (async (url: string | URL | Request,) => {
      expect(String(url,),).toBe("http://127.0.0.1:9010/sdcpp/v1/capabilities",);
      return Response.json({ version: "t", runtime: { state: "ready", }, },);
    }) as typeof fetch;

    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(post("http://localhost/api/admin/sd-status/sdcpp/setup", {
      ...BODY,
      apiKey: "proxy-secret",
      defaults: { steps: 30, },
    },),);

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      ok: boolean;
      generationLive: boolean;
      provider: { name: string; hasApiKey: boolean; defaults: { steps: number } };
    };

    expect(body.ok,).toBe(true,);
    expect(body.generationLive,).toBe(true,);
    expect(body.provider.name,).toBe("local-sdcpp",);
    expect(body.provider.hasApiKey,).toBe(true,);
    expect(body.provider.defaults.steps,).toBe(30,);
    expect(JSON.stringify(body,),).not.toContain("proxy-secret",);
  });

  test("POST rejects an unreachable target with 502 and stores nothing", async () => {
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error("connection refused",);
    };

    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(post("http://localhost/api/admin/sd-status/sdcpp/setup", BODY,),);

    expect(res.status,).toBe(502,);
    const body = await res.json() as { message?: string } & Record<string, unknown>;
    expect(JSON.stringify(body,),).toContain("unreachable",);
    expect(await db.selectFrom("system_config",).selectAll().execute(),).toEqual([],);
  });

  test("POST answers 400 for schema violations and invalid names", async () => {
    (globalThis as Record<string, unknown>).fetch = async () => Response.json({},);

    const app = makeApp(db, "admin", {} as Config,);
    const badName = await app.handle(post("http://localhost/api/admin/sd-status/sdcpp/setup", {
      ...BODY,
      name: "-bad",
    },),);

    expect(badName.status,).toBe(400,);

    const badUrl = await app.handle(post("http://localhost/api/admin/sd-status/sdcpp/setup", {
      name: "ok-name",
      baseUrl: "http://169.254.169.254/",
    },),);

    expect(badUrl.status,).toBe(400,);
    const urlBody = await badUrl.json() as { error: string };
    expect(urlBody.error,).toContain("baseUrl",);
  });

  test("DELETE removes a stored setup, answers 400 for unknown names", async () => {
    await saveSdCppSetup(db, { name: "gone-soon", baseUrl: "http://127.0.0.1:9010", },);

    const app = makeApp(db, "admin", {} as Config,);
    const removed = await app.handle(
      new Request("http://localhost/api/admin/sd-status/sdcpp/setup/gone-soon", { method: "DELETE", },),
    );

    expect(removed.status,).toBe(204,);
    expect(await db.selectFrom("system_config",).selectAll().execute(),).toEqual([],);

    const missing = await app.handle(
      new Request("http://localhost/api/admin/sd-status/sdcpp/setup/ghost", { method: "DELETE", },),
    );

    expect(missing.status,).toBe(400,);
  });
});
