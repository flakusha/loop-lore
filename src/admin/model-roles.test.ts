// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums-core";
import type { DB, } from "../db/schema";
import { getProvider, registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { LLMProvider, } from "../generation/providers/types";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  clearModelRoleOverride,
  getModelRoleOverrides,
  resolveAllModelRoles,
  resolveModelRole,
  setModelRoleOverride,
  VALID_ROLES,
} from "./model-roles";

const TEST_PROVIDER = "test-roles-provider";

/**
 * Build a stub provider for role-override tests.
 * @returns A minimal LLMProvider cast from a stub shape.
 */
function makeProvider(): LLMProvider {
  // NOTE: label is required — the provider registry is process-global, so
  // this stub is visible to other test files in the same bun process
  // (e.g. routes/admin/providers.test.ts shape-checks capabilities.label).
  return {
    capabilities: { label: "Test Roles Provider", streaming: false, },
    complete: async () => {
      throw new Error("unused",);
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
}

/**
 * Build a minimal Config with a generation section for testing.
 * @param generation - Partial generation section merged over the defaults.
 * @returns A Config cast from the minimal shape.
 */
function makeConfig(generation: Record<string, unknown> = {},): Config {
  return {
    generation: {
      defaultProvider: TEST_PROVIDER,
      defaultModels: { [TEST_PROVIDER]: "test-default-model", },
      ...generation,
    },
  } as unknown as Config;
}

// Bun's mock.module is process-global and cannot be unmocked: without
// --isolate, an earlier file (e.g. admin/provider-health-isolated.test.ts)
// may have replaced the provider registry with fakes whose register/get
// are disconnected. Sentinel roundtrip: register + read back; skip when
// the registry is a stub instead of asserting against it
// (pristine-module guard; see generation/providers/registry.test.ts).
const REGISTRY_PROBE_PROVIDER = "__registry_pristine_probe__";
registerProvider(REGISTRY_PROBE_PROVIDER, makeProvider(),);
const registryPristine = getProvider(REGISTRY_PROBE_PROVIDER,) !== undefined;
unregisterProvider(REGISTRY_PROBE_PROVIDER,);
const describeReal = registryPristine ? describe : describe.skip;

describeReal("model-roles", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeEach(async () => {
    createLogger({ level: "warn", },);
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    registerProvider(TEST_PROVIDER, makeProvider(),);
  },);

  afterEach(() => {
    // The provider registry is process-global: a leftover registration flips
    // isLlmGenerationConfigured() to true for every later suite (e.g.
    // routes/messages/reply.test.ts takes the LLM path and returns replied:false).
    unregisterProvider(TEST_PROVIDER,);
    sqlite.close();
  },);

  describe("resolveModelRole", () => {
    test("DB override wins over config and server defaults", async () => {
      await setModelRoleOverride(ModelRole.Main, TEST_PROVIDER, "db-model", db,);
      const config = makeConfig({
        modelRoles: { [ModelRole.Main]: { provider: "cfg-provider", model: "cfg-model", }, },
      },);

      const resolved = await resolveModelRole(ModelRole.Main, config, db,);
      expect(resolved.source,).toBe("db",);
      expect(resolved.provider,).toBe(TEST_PROVIDER,);
      expect(resolved.model,).toBe("db-model",);
    });

    test("falls back to config modelRoles when no DB override exists", async () => {
      const config = makeConfig({
        modelRoles: { [ModelRole.Captioning]: { provider: "cfg-provider", model: "cfg-model", }, },
      },);

      const resolved = await resolveModelRole(ModelRole.Captioning, config, db,);
      expect(resolved.source,).toBe("config",);
      expect(resolved.provider,).toBe("cfg-provider",);
      expect(resolved.model,).toBe("cfg-model",);
    });

    test("falls back to server defaults when neither DB nor config specifies the role", async () => {
      const resolved = await resolveModelRole(ModelRole.Main, makeConfig(), db,);
      expect(resolved.source,).toBe("default",);
      expect(resolved.provider,).toBe(TEST_PROVIDER,);
      expect(resolved.model,).toBe("test-default-model",);
    });

    test("degrades gracefully to an empty role when config.generation is missing", async () => {
      const resolved = await resolveModelRole(
        ModelRole.Main,
        {} as unknown as Config,
        db,
      );
      expect(resolved.source,).toBe("default",);
      expect(resolved.provider,).toBe("",);
      expect(resolved.model,).toBe("",);
    });

    test("throws for a role outside VALID_ROLES", async () => {
      await expect(resolveModelRole(ModelRole.Moderation, makeConfig(), db,),).rejects.toThrow();
    });
  });

  describe("resolveAllModelRoles", () => {
    test("returns every VALID_ROLES entry", async () => {
      const roles = await resolveAllModelRoles(makeConfig(), db,);
      expect(roles.length,).toBe(VALID_ROLES.length,);
      expect(roles.map((r,) => r.role).sort(),).toEqual([...VALID_ROLES,].sort(),);
    });
  });

  describe("model role override CRUD", () => {
    test("set/clear/get roundtrip with tuning", async () => {
      expect(await getModelRoleOverrides(db,),).toEqual({},);

      await setModelRoleOverride(ModelRole.Auxiliary, TEST_PROVIDER, "aux-model", db, {
        temperature: 0.5,
        maxTokens: 100,
      },);

      const overrides = await getModelRoleOverrides(db,);
      expect(overrides[ModelRole.Auxiliary],).toEqual({
        provider: TEST_PROVIDER,
        model: "aux-model",
        temperature: 0.5,
        maxTokens: 100,
      },);

      const resolved = await resolveModelRole(ModelRole.Auxiliary, makeConfig(), db,);
      expect(resolved.source,).toBe("db",);
      expect(resolved.model,).toBe("aux-model",);

      await clearModelRoleOverride(ModelRole.Auxiliary, db,);
      expect(await getModelRoleOverrides(db,),).toEqual({},);

      const afterClear = await resolveModelRole(ModelRole.Auxiliary, makeConfig(), db,);
      expect(afterClear.source,).toBe("default",);
    });

    test("set throws on unknown provider", async () => {
      await expect(
        setModelRoleOverride(ModelRole.Main, "no-such-provider", "m", db,),
      ).rejects.toThrow(/not found/,);
    });

    test("clear throws on invalid role", async () => {
      await expect(clearModelRoleOverride(ModelRole.Moderation, db,),).rejects.toThrow();
    });
  });
},);
