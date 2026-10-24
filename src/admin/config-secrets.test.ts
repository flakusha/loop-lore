// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests: a secret-classified `system_config` value is stored
 * sealed (never as plain text) and reads back as plain text.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { initSmk, } from "../crypto/smk";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { getConfig, getConfigValue, setConfig, } from "./config";
import { isSecretConfigKey, openConfigValue, sealConfigValue, } from "./config-secrets";

const VALID_HEX_KEY = "f".repeat(64,);

/** Install an active SMK so the credential envelope has key material. */
async function useServerKey(): Promise<void> {
  await initSmk({
    serverEncryptionKey: VALID_HEX_KEY,
    required: false,
    compressThreshold: 1024,
    compressAlgorithm: "gzip",
  },);
}

describe("system_config secret storage", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
    await useServerKey();
  },);

  afterAll(async () => {
    // Reset the process-global SMK so later suites do not inherit an active key.
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    await db.destroy();
  },);

  beforeEach(async () => {
    await db.deleteFrom("system_config",).execute();
    await useServerKey();
  },);

  test("a secret-classified key is stored sealed, never as plain text", async () => {
    await setConfig(db, "write.token", "tok-123",);
    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", "write.token",)
      .executeTakeFirst();

    expect(row?.value,).toBeDefined();
    expect(row?.value,).not.toBe("tok-123",);
    expect(row?.value,).not.toContain("tok-123",);
    expect(row?.value,).toStartWith("secret:v1:",);
  });

  test("a sealed value reads back as plain text", async () => {
    await setConfig(db, "write.token", "tok-123",);

    expect(await getConfigValue(db, "write.token",),).toBe("tok-123",);
    expect((await getConfig(db, "write.token",))?.value,).toBe("tok-123",);
  });

  test("a non-secret key is stored as plain text", async () => {
    await setConfig(db, "logging.level", "error",);
    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", "logging.level",)
      .executeTakeFirst();

    expect(row?.value,).toBe("error",);
  });

  test("a secret write without key material is refused instead of stored in plain text", async () => {
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);

    await expect(setConfig(db, "write.token", "tok-123",),).rejects.toThrow(/secret config key/,);

    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", "write.token",)
      .executeTakeFirst();

    expect(row,).toBeUndefined();
  });

  test("a sealed value that cannot be opened is returned as the stored reference", async () => {
    await setConfig(db, "write.token", "tok-123",);
    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", "write.token",)
      .executeTakeFirst();

    // Drop the key material: the stored value can no longer be opened.
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);

    const opened = await openConfigValue("write.token", row!.value,);

    expect(opened,).toBe(row!.value,);
    expect(opened,).toStartWith("secret:v1:",);
  });

  test("a legacy plain-text row still reads back as plain text", async () => {
    await db.insertInto("system_config",).values({ key: "legacy.token", value: "plain-legacy", },).execute();

    expect(await getConfigValue(db, "legacy.token",),).toBe("plain-legacy",);
  });

  test("the helper classifies secret keys and round-trips a value", async () => {
    expect(isSecretConfigKey("write.token",),).toBe(true,);
    expect(isSecretConfigKey("logging.level",),).toBe(false,);

    const sealed = await sealConfigValue("write.token", "tok-123",);
    expect(sealed,).toStartWith("secret:v1:",);
    expect(await openConfigValue("write.token", sealed,),).toBe("tok-123",);
    expect(await openConfigValue("logging.level", "error",),).toBe("error",);
  });
});
