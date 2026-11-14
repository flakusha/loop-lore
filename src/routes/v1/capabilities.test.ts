// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Capability manifest route — the machine-readable description of what the
 * facade can do. Pinned here: the manifest is GENERATED from the op
 * registry (the op list is counted against the registry, so a newly
 * registered op cannot slip past), every entry carries a body + output
 * schema, and the route is AUTHENTICATED (no anonymous discovery).
 *
 * Resource contract (parallel-safe): ONE `:memory:` SQLite per test and a
 * fresh registry per test (the registry singleton is process-global).
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { getFacadeRegistry, resetFacadeRegistry, } from "../../integrations/loop-lore-facade/instance";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { type CapabilityManifest, capabilityManifestRoutes, } from "./capabilities";

const PREFIX = "/api/v1";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  config = createConfigSchema().defaults as unknown as Config;
  resetFacadeRegistry();
},);

afterEach(async () => {
  resetFacadeRegistry();
  await destroyTestDb(testDb,);
},);

function makeApp(userId: string | null,): Elysia {
  const app = new Elysia({ name: "test-capabilities", },);
  app.derive(() => ({ userId, }));
  return app.use(capabilityManifestRoutes({ database: db, config, }, PREFIX,),);
}

async function manifest(app: Elysia,): Promise<CapabilityManifest> {
  const res = await app.handle(new Request(`http://localhost${PREFIX}/capabilities`,),);
  expect(res.status,).toBe(200,);
  return await res.json() as CapabilityManifest;
}

describe("capability manifest route", () => {
  test("lists every op the registry has (counted against the registry)", async () => {
    const registry = getFacadeRegistry({ database: db, config, },);
    const registered = registry.manifest();

    const body = await manifest(makeApp("manifest-user",),);

    expect(body.ops.length,).toBe(registered.length,);
    expect(body.ops.map((op,) => op.name).sort(),).toEqual(registered.map((op,) => op.name).sort(),);
  });

  test("every entry carries a body schema and an output schema", async () => {
    const body = await manifest(makeApp("manifest-user",),);

    expect(body.ops.length,).toBeGreaterThan(0,);
    for (const op of body.ops) {
      expect(op.bodySchema,).toBeDefined();
      expect(op.outputSchema,).toBeDefined();
      expect(typeof op.bodySchema.type,).toBe("string",);
      expect(typeof op.outputSchema.type,).toBe("string",);
    }
  });

  test("every entry carries the annotations, the scope tier and the rate policy", async () => {
    const body = await manifest(makeApp("manifest-user",),);

    for (const op of body.ops) {
      expect(typeof op.annotations.readOnly,).toBe("boolean",);
      expect(typeof op.annotations.destructive,).toBe("boolean",);
      expect(typeof op.annotations.idempotent,).toBe("boolean",);
      expect(["read", "chat-write",],).toContain(op.scope,);
      expect(op.ratePolicy.length,).toBeGreaterThan(0,);
    }
  });

  test("the manifest is authenticated — an anonymous caller gets 401", async () => {
    const res = await makeApp(null,).handle(new Request(`http://localhost${PREFIX}/capabilities`,),);

    expect(res.status,).toBe(401,);
  });
});
