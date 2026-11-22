// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for GET /api/admin/effective-config/export (file-plane + DB-plane
 * merged export with omit-and-note redaction).
 *
 * Verifies:
 *   - 401 for anonymous / 403 for non-admin
 *   - happy path merges both planes
 *   - nested secret-adjacent keys are omitted while siblings survive
 *   - unopenable envelopes are omitted, never leaked (grep-proof)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { setConfig, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { effectiveConfigRoutes, } from "./effective-config";

/**
 * @param db
 * @param userRole
 * @param config file-plane config for the merge
 */
function makeApp(db: Kysely<DB>, userRole: string | null, config: unknown,) {
  const app = new Elysia({ name: "test-effective-config", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(effectiveConfigRoutes({ database: db, config: config as Config, }, "/api",),);
}

/** Envelope shape the route returns. */
interface ExportBody {
  values: Record<string, unknown>;
  omitted: string[];
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(async () => {
  sqlite.close();
},);

describe("admin effective-config export", () => {
  test("returns 401 for anonymous", async () => {
    const app = makeApp(db, null, {},);
    const res = await app.handle(new Request("http://localhost/api/admin/effective-config/export",),);
    expect(res.status,).toBe(401,);
  });

  test("returns 403 for non-admin", async () => {
    const app = makeApp(db, "user", {},);
    const res = await app.handle(new Request("http://localhost/api/admin/effective-config/export",),);
    expect(res.status,).toBe(403,);
  });

  test("merges file-plane and DB-plane values", async () => {
    await setConfig(db, "test.effective.plain", "db-value",);
    const app = makeApp(db, "admin", {
      generation: { defaultProvider: "openai", },
      test: { fromFile: "file-value", },
    },);

    const res = await app.handle(new Request("http://localhost/api/admin/effective-config/export",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as ExportBody;
    const generation = body.values["generation"] as Record<string, unknown>;
    expect(generation["defaultProvider"],).toBe("openai",);
    const test = body.values["test"] as Record<string, unknown>;
    expect(test["fromFile"],).toBe("file-value",);
    const effective = test["effective"] as Record<string, unknown>;
    expect(effective["plain"],).toBe("db-value",);
  });

  test("redacts nested secret keys while siblings survive", async () => {
    const app = makeApp(db, "admin", {
      integrations: { gifs: { apiKey: "SENTINEL-NESTED-APIKEY-1", provider: "tenor", }, },
      nsfw: { piiSecret: "SENTINEL-NESTED-PIISECRET-1", review: "visible", },
    },);

    const res = await app.handle(new Request("http://localhost/api/admin/effective-config/export",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as ExportBody;
    expect(body.omitted,).toContain("nsfw.piiSecret",);
    expect(body.omitted,).toContain("integrations.gifs.apiKey",);
    const nsfw = body.values["nsfw"] as Record<string, unknown>;
    expect(nsfw["review"],).toBe("visible",);
    const gifs = (body.values["integrations"] as Record<string, unknown>)["gifs"] as Record<string, unknown>;
    expect(gifs["provider"],).toBe("tenor",);
    const raw = JSON.stringify(body,);
    expect(raw,).not.toContain("SENTINEL-NESTED-APIKEY-1",);
    expect(raw,).not.toContain("SENTINEL-NESTED-PIISECRET-1",);
  });

  test("omits unopenable envelopes without leaking the value", async () => {
    await db
      .insertInto("system_config",)
      .values({ key: "test.broken-envelope", value: "secret:v1:SENTINEL-BROKEN-ENVELOPE-1", description: null, },)
      .execute();

    const app = makeApp(db, "admin", {},);
    const res = await app.handle(new Request("http://localhost/api/admin/effective-config/export",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as ExportBody;
    expect(body.omitted,).toContain("test.broken-envelope",);
    expect(JSON.stringify(body,),).not.toContain("SENTINEL-BROKEN-ENVELOPE-1",);
  });

  test("omits sealed and legacy secret keys without leaking values", async () => {
    await db
      .insertInto("system_config",)
      .values({ key: "test.hidden.apiKey", value: "secret:v1:SENTINEL-SEALED-SECRET-1", description: null, },)
      .execute();

    await db
      .insertInto("system_config",)
      .values({ key: "test.legacy.token", value: "SENTINEL-LEGACY-TOKEN-1", description: null, },)
      .execute();

    const app = makeApp(db, "admin", {},);
    const res = await app.handle(new Request("http://localhost/api/admin/effective-config/export",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as ExportBody;
    expect(body.omitted,).toContain("test.hidden.apiKey",);
    expect(body.omitted,).toContain("test.legacy.token",);
    const raw = JSON.stringify(body,);
    expect(raw,).not.toContain("SENTINEL-SEALED-SECRET-1",);
    expect(raw,).not.toContain("SENTINEL-LEGACY-TOKEN-1",);
  });

  test("exposes token-budget fields but omits real secrets from the file plane", async () => {
    const app = makeApp(db, "admin", {
      prompt: {
        loreTokenBudget: "1024",
        memoryTokenBudget: "2048",
        apiKey: "SENTINEL-FILE-PLANE-APIKEY-1",
      },
    },);

    const res = await app.handle(new Request("http://localhost/api/admin/effective-config/export",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as ExportBody;
    const prompt = body.values["prompt"] as Record<string, unknown>;
    expect(prompt["loreTokenBudget"],).toBe("1024",);
    expect(prompt["memoryTokenBudget"],).toBe("2048",);
    expect(body.omitted,).toContain("prompt.apiKey",);
    expect(JSON.stringify(body,),).not.toContain("SENTINEL-FILE-PLANE-APIKEY-1",);
  });
});
