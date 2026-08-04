/**
 * NSFW Runtime Config Store — unit tests
 *
 * Covers the runtime NSFW config store used to give the admin "Allow NSFW"
 * toggle live enforcement effect: seeding from file config, live updates,
 * and overlaying persisted system_config values on startup.
 */
import { describe, expect, test, } from "bun:test";
import type { Generated, Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertSystemConfig, } from "../test-utils/insert-helpers";
import {
  applyStoredNsfwConfig,
  getRuntimeNsfwConfig,
  initNsfwRuntimeConfig,
  updateRuntimeNsfwConfig,
} from "./runtime-config";

describe("nsfw runtime config store", () => {
  test("init seeds defaults and preserves file-provided values", () => {
    initNsfwRuntimeConfig({
      allowNsfw: false,
      nsfwMinAge: 21,
      defaultNsfwScope: "user",
      consentRequired: false,
      auditLogging: true,
      useLlmClassifier: false,
    },);
    const cfg = getRuntimeNsfwConfig();
    expect(cfg.allowNsfw,).toBe(false,);
    expect(cfg.nsfwMinAge,).toBe(21,);
    expect(cfg.defaultNsfwScope,).toBe("user",);
    expect(cfg.consentRequired,).toBe(false,);
    expect(cfg.auditLogging,).toBe(true,);
  });

  test("update applies partial changes to the live store", () => {
    initNsfwRuntimeConfig({
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: true,
      useLlmClassifier: false,
    },);
    updateRuntimeNsfwConfig({ allowNsfw: false, nsfwMinAge: 21, },);
    const cfg = getRuntimeNsfwConfig();
    expect(cfg.allowNsfw,).toBe(false,);
    expect(cfg.nsfwMinAge,).toBe(21,);
    // Untouched fields keep their values.
    expect(cfg.defaultNsfwScope,).toBe("chat",);
    expect(cfg.consentRequired,).toBe(true,);
  });

  test("get returns a copy, not a reference", () => {
    initNsfwRuntimeConfig({
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: true,
      useLlmClassifier: false,
    },);
    getRuntimeNsfwConfig().allowNsfw = false;
    expect(getRuntimeNsfwConfig().allowNsfw,).toBe(true,);
  });

  test("applyStoredNsfwConfig overlays persisted system_config values", async () => {
    const { db, } = await createTestDb();
    initNsfwRuntimeConfig({
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: true,
      useLlmClassifier: false,
    },);
    await insertConfig(db, "nsfw_allow", "false",);
    await insertConfig(db, "nsfw_min_age", "21",);

    await applyStoredNsfwConfig(db,);
    const cfg = getRuntimeNsfwConfig();
    expect(cfg.allowNsfw,).toBe(false,);
    expect(cfg.nsfwMinAge,).toBe(21,);
  });

  test("applyStoredNsfwConfig ignores malformed persisted values", async () => {
    const { db, } = await createTestDb();
    initNsfwRuntimeConfig({
      allowNsfw: true,
      nsfwMinAge: 18,
      defaultNsfwScope: "chat",
      consentRequired: true,
      auditLogging: true,
      useLlmClassifier: false,
    },);
    await insertConfig(db, "nsfw_allow", "not-a-bool",);
    await insertConfig(db, "nsfw_min_age", "99999",);

    await applyStoredNsfwConfig(db,);
    const cfg = getRuntimeNsfwConfig();
    expect(cfg.allowNsfw,).toBe(true,);
    expect(cfg.nsfwMinAge,).toBe(18,);
  });
});

/** Insert a system_config row with a stable key. */
async function insertConfig(
  db: Kysely<DB>,
  key: string,
  value: string,
): Promise<void> {
  await insertSystemConfig(db, value, { key: key as unknown as Generated<string>, },);
}
