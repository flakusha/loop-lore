// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Null-path coverage for the async intent classifier
 * (src/generation/auto-gen/classify-intent.ts).
 *
 * `parseIntentClassification` is covered by classify-intent.test.ts; here
 * the async `classifyIntent` wrapper is exercised for its two documented
 * null outcomes: no auxiliary model configured (empty role) and an
 * unavailable pipeline (damaged config → caught, null). No provider is
 * registered and no network is touched on either path.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { classifyIntent, } from "./classify-intent";

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

afterAll(() => {
  testSqlite.close();
},);

describe("classifyIntent — null paths", () => {
  test("returns null when no auxiliary model is configured", async () => {
    const config = {
      ...loadConfig(),
      generation: undefined as unknown as Config["generation"],
    };
    // An absent generation section resolves the auxiliary role to empty,
    // so callAux returns null before any provider lookup.
    await expect(classifyIntent("hello there", config, testDb,),).resolves.toBeNull();
  });

  test("returns null when the pipeline throws on damaged input", async () => {
    const damaged = undefined as unknown as Config;
    await expect(classifyIntent("hello there", damaged, testDb,),).resolves.toBeNull();
  });

  test("returns null for an empty message with no aux configured", async () => {
    const config = {
      ...loadConfig(),
      generation: undefined as unknown as Config["generation"],
    };
    await expect(classifyIntent("", config, testDb,),).resolves.toBeNull();
  });
});
