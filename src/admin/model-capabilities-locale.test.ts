// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Native-locale override tests (FEAT-model-native-locale-config):
 * setModelOverride persists nativeLocale, clearModelOverride resets it,
 * and the upsert rescan path NEVER clobbers an admin-authored locale.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { upsertModelCapabilities, } from "./model-capabilities";
import { clearModelOverride, setModelOverride, } from "./model-capabilities-overrides";

const PROVIDER = "nl-provider";
const MODEL = "nl-model";

/** */
async function seedRow(db: Kysely<DB>, nativeLocale: string | null,): Promise<void> {
  const now = new Date().toISOString();
  await db.insertInto("model_capabilities",).values({
    id: crypto.randomUUID(),
    provider_id: PROVIDER,
    model_id: MODEL,
    context_window: null,
    max_output: null,
    supports_tools: 0,
    supports_vision: 0,
    supports_thinking: 0,
    modalities: null,
    param_size: null,
    owned_by: null,
    user_override: 0,
    notes: null,
    native_locale: nativeLocale,
    last_seen: now,
    created_at: now,
    updated_at: now,
  },).execute();
}

/** */
async function readLocale(db: Kysely<DB>,): Promise<string | null> {
  const row = await db.selectFrom("model_capabilities",)
    .select("native_locale",)
    .where("provider_id", "=", PROVIDER,)
    .where("model_id", "=", MODEL,)
    .executeTakeFirst();

  return row?.native_locale ?? null;
}

describe("model native locale override", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;

  beforeAll(async () => {
    fixture = await createTestDb();
    db = fixture.db;
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  beforeEach(async () => {
    await db.deleteFrom("model_capabilities",).execute();
    await seedRow(db, null,);
  },);

  test("setModelOverride persists the locale; clearModelOverride resets it", async () => {
    expect(await setModelOverride(db, PROVIDER, MODEL, { nativeLocale: "ja", },),).toBe(true,);
    expect(await readLocale(db,),).toBe("ja",);

    expect(await clearModelOverride(db, PROVIDER, MODEL,),).toBe(true,);
    expect(await readLocale(db,),).toBeNull();
  });

  test("rescan upserts never clobber an admin-authored locale", async () => {
    await setModelOverride(db, PROVIDER, MODEL, { nativeLocale: "de", },);

    // scanAllProviders-shaped rescan: same model reported by the provider.
    await upsertModelCapabilities(db, PROVIDER, [
      { id: MODEL, contextWindow: 4096, maxOutput: 1024, toolCalling: true, thinking: false, },
    ],);

    expect(await readLocale(db,),).toBe("de",);
  });

  test("rescan insert path leaves native_locale NULL (never seeds it)", async () => {
    await db.deleteFrom("model_capabilities",).execute();
    await upsertModelCapabilities(db, PROVIDER, [
      { id: MODEL, contextWindow: 1024, maxOutput: 256, toolCalling: false, thinking: false, },
    ],);

    expect(await readLocale(db,),).toBeNull();
  });
});
