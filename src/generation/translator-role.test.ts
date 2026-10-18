// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the translator model role.
 *
 * These pin CONSUMER-VISIBLE resolution: which provider/model a translation
 * call would actually use, given config and DB state.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";

import type { Kysely, } from "kysely";
import { setModelRoleOverride, } from "../admin/model-roles";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums-core";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { registerProvider, unregisterProvider, } from "./providers/registry";
import type { LLMProvider, } from "./providers/types";
import { resolveTranslatorRole, } from "./translator-role";

/** Stub provider — enough shape for the registry and role-override writes. */
function makeProvider(): LLMProvider {
  return {
    capabilities: { label: "Translator Test Provider", streaming: false, },
    complete: async () => {
      throw new Error("unused",);
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
}

// Provider names are unique per RUN: the registry is process-global and
// registerProvider() is idempotent (registry.ts:36-38), so a fixed name lets a
// sibling file's registration silently win and these stubs never install.
// Teardown unregisters in `finally`.
const RUN_ID = randomUUID().slice(0, 8,);
const GENERAL_PROVIDER = `translator-test-general-${RUN_ID}`;
const GENERAL_MODEL = "general-model";
const TRANSLATOR_PROVIDER = `translator-test-translator-${RUN_ID}`;
const TRANSLATOR_MODEL = "translator-model";

/** General model is what a translator-free install must resolve to. */
function makeConfig(modelRoles: Record<string, unknown> = {},): Config {
  return {
    generation: {
      defaultProvider: GENERAL_PROVIDER,
      defaultModels: { [GENERAL_PROVIDER]: GENERAL_MODEL, },
      modelRoles,
    },
  } as unknown as Config;
}

describe("resolveTranslatorRole", () => {
  let db: Kysely<DB>;
  let fixture: TestDb;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
    db = fixture.db;
  },);

  afterEach(async () => {
    // destroyTestDb, not a bare sqlite.close(): it also clears a stale
    // process-global override that would otherwise hand a closed handle to
    // every sibling file (src/test-utils/create-test-db.ts:63-82).
    await destroyTestDb(fixture,);
  },);

  // (a) unset translator config resolves to the general model
  test("unset translator resolves to the general model", async () => {
    const resolved = await resolveTranslatorRole(makeConfig(), db,);

    expect(resolved.provider,).toBe(GENERAL_PROVIDER,);
    expect(resolved.model,).toBe(GENERAL_MODEL,);
    expect(resolved.source,).toBe("general-fallback",);
  });

  // (b) an explicit translator model resolves to that model, NOT the general one
  test("explicit translator resolves to the translator model, not the general one", async () => {
    const resolved = await resolveTranslatorRole(
      makeConfig({ translator: { provider: TRANSLATOR_PROVIDER, model: TRANSLATOR_MODEL, }, },),
      db,
    );

    expect(resolved.provider,).toBe(TRANSLATOR_PROVIDER,);
    expect(resolved.model,).toBe(TRANSLATOR_MODEL,);
    expect(resolved.model,).not.toBe(GENERAL_MODEL,);
    expect(resolved.source,).toBe("config",);
  });

  // (c) a half-configured translator must not silently address a provider.
  // Repo convention is graceful read degradation (model-roles.ts reads never
  // throw), so the honest behaviour is a fallback to the general model —
  // reported as `general-fallback`, never disguised as a configured translator.
  test("translator missing its model falls back to the general model and says so", async () => {
    const resolved = await resolveTranslatorRole(
      makeConfig({ translator: { provider: TRANSLATOR_PROVIDER, model: "", }, },),
      db,
    );

    expect(resolved.provider,).toBe(GENERAL_PROVIDER,);
    expect(resolved.model,).toBe(GENERAL_MODEL,);
    expect(resolved.source,).toBe("general-fallback",);
  });

  test("translator missing its provider falls back to the general model and says so", async () => {
    const resolved = await resolveTranslatorRole(
      makeConfig({ translator: { provider: "", model: TRANSLATOR_MODEL, }, },),
      db,
    );

    expect(resolved.provider,).toBe(GENERAL_PROVIDER,);
    expect(resolved.model,).toBe(GENERAL_MODEL,);
    expect(resolved.source,).toBe("general-fallback",);
  });

  // (d) resolution precedence when both a DB override and a config entry exist
  test("DB override wins over the config translator assignment", async () => {
    await db
      .insertInto("model_role_overrides",)
      .values({ role: ModelRole.Translator, provider: TRANSLATOR_PROVIDER, model: "db-translator-model", },)
      .execute();

    const resolved = await resolveTranslatorRole(
      makeConfig({ translator: { provider: TRANSLATOR_PROVIDER, model: TRANSLATOR_MODEL, }, },),
      db,
    );

    expect(resolved.model,).toBe("db-translator-model",);
    expect(resolved.model,).not.toBe(TRANSLATOR_MODEL,);
    expect(resolved.source,).toBe("db",);
  });

  // A DB override outranks the general model too — the fallback is only for unset.
  test("DB override applies even when no config translator entry exists", async () => {
    await db
      .insertInto("model_role_overrides",)
      .values({ role: ModelRole.Translator, provider: TRANSLATOR_PROVIDER, model: "db-translator-model", },)
      .execute();

    const resolved = await resolveTranslatorRole(makeConfig(), db,);

    expect(resolved.model,).toBe("db-translator-model",);
    expect(resolved.source,).toBe("db",);
  });

  // The general model itself is settable; the translator fallback must follow it.
  test("unset translator follows an explicitly configured main role", async () => {
    await db
      .insertInto("model_role_overrides",)
      .values({ role: ModelRole.Main, provider: GENERAL_PROVIDER, model: "db-general-model", },)
      .execute();

    const resolved = await resolveTranslatorRole(makeConfig(), db,);

    expect(resolved.model,).toBe("db-general-model",);
    expect(resolved.source,).toBe("general-fallback",);
  });

  test("no configured provider at all resolves empty rather than throwing", async () => {
    const bare = { generation: { defaultProvider: "", defaultModels: {}, modelRoles: {}, }, } as unknown as Config;
    const resolved = await resolveTranslatorRole(bare, db,);

    expect(resolved.provider,).toBe("",);
    expect(resolved.model,).toBe("",);
    expect(resolved.source,).toBe("general-fallback",);
  });

  // Guards the admin write path: the translator role must be assignable.
  test("setModelRoleOverride accepts the translator role", async () => {
    registerProvider(TRANSLATOR_PROVIDER, makeProvider(),);
    try {
      await setModelRoleOverride(ModelRole.Translator, TRANSLATOR_PROVIDER, TRANSLATOR_MODEL, db,);

      const resolved = await resolveTranslatorRole(makeConfig(), db,);
      expect(resolved.provider,).toBe(TRANSLATOR_PROVIDER,);
      expect(resolved.model,).toBe(TRANSLATOR_MODEL,);
      expect(resolved.source,).toBe("db",);
    } finally {
      unregisterProvider(TRANSLATOR_PROVIDER,);
    }
  });
});
