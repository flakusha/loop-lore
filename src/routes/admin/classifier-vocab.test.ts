// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the classifier tag vocabulary contract on the generic
 * `PATCH /api/admin/system-config` endpoint: a valid JSON string[] persists
 * under `classifier_tag_vocabulary`; non-empty/uniqueness/length violations
 * are rejected with 400 and persist nothing. Authorization stays
 * `admin.system` (401 anonymous / 403 plain user).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../../admin/config";
import { CLASSIFIER_TAG_VOCABULARY_KEY, } from "../../aux-pipeline/class-template-resolver";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { systemConfigRoutes, } from "./system-config";

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  createLogger({ level: "error", },);
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(() => {
  sqlite.close();
},);

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const config = createConfigSchema().defaults as Config;
  const app = new Elysia({ name: "test-classifier-vocab", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(systemConfigRoutes({ database: db, config, }, "/api",),);
}

/**
 * @param app
 * @param value - raw JSON string body value for the vocabulary key
 */
function patchVocab(app: ReturnType<typeof makeApp>, value: string,): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/admin/system-config", {
      method: "PATCH",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({ key: CLASSIFIER_TAG_VOCABULARY_KEY, value, },),
    },),
  );
}

describe("PATCH /api/admin/system-config — classifier_tag_vocabulary", () => {
  test("401 for anonymous", async () => {
    const res = await patchVocab(makeApp(db, null,), '["tavern"]',);
    expect(res.status,).toBe(401,);
  });

  test("403 for a plain user", async () => {
    const res = await patchVocab(makeApp(db, "user",), '["tavern"]',);
    expect(res.status,).toBe(403,);
  });

  test("200 with valid array persists the trimmed vocabulary", async () => {
    const res = await patchVocab(makeApp(db, "admin",), '["tavern", "  dungeon  "]',);
    expect(res.status,).toBe(200,);
    const stored = await getConfigValue(db, CLASSIFIER_TAG_VOCABULARY_KEY,);
    expect(JSON.parse(stored ?? "null",),).toEqual(["tavern", "dungeon",],);
  });

  test("400 on duplicate entries and nothing persists", async () => {
    const before = await getConfigValue(db, CLASSIFIER_TAG_VOCABULARY_KEY,);
    const res = await patchVocab(makeApp(db, "admin",), '["tavern", "tavern"]',);
    expect(res.status,).toBe(400,);
    expect(await getConfigValue(db, CLASSIFIER_TAG_VOCABULARY_KEY,),).toBe(before,);
  });

  test("400 on an empty entry", async () => {
    const res = await patchVocab(makeApp(db, "admin",), '["tavern", "   "]',);
    expect(res.status,).toBe(400,);
  });

  test("400 on an over-length entry", async () => {
    const res = await patchVocab(makeApp(db, "admin",), `["${"x".repeat(65,)}"]`,);
    expect(res.status,).toBe(400,);
  });

  test("400 on a non-array value", async () => {
    const res = await patchVocab(makeApp(db, "admin",), '"tavern"',);
    expect(res.status,).toBe(400,);
  });

  test("400 on malformed JSON", async () => {
    const res = await patchVocab(makeApp(db, "admin",), "not-json",);
    expect(res.status,).toBe(400,);
  });
});
