/**
 * Tests for admin/config.ts — System Config CRUD
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { deleteConfig, getAllConfig, getConfig, setConfig, } from "./config";
import { deleteConfig, getAllConfig, getConfig, setConfig, } from "./config";

describe("getAllConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
    await db.insertInto("system_config",).values({ key: "foo", value: "bar", },).execute();
    await db.insertInto("system_config",).values({ key: "baz", value: "qux", },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns all config entries", async () => {
    const entries = await getAllConfig(db,);
    expect(entries,).toHaveLength(2,);
    expect(entries.find((e,) => e.key === "foo")?.value,).toBe("bar",);
    expect(entries.find((e,) => e.key === "baz")?.value,).toBe("qux",);
  });
});

describe("getConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await db
      .insertInto("system_config",)
      .values({ key: "foo", value: "bar", description: "Test key", },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns config by key", async () => {
    const entry = await getConfig(db, "foo",);
    expect(entry,).toBeDefined();
    expect(entry!.value,).toBe("bar",);
    expect(entry!.description,).toBe("Test key",);
  });

  test("returns undefined for missing key", async () => {
    const entry = await getConfig(db, "nonexistent",);
    expect(entry,).toBeUndefined();
  });
});

describe("setConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("creates new config entry", async () => {
    await setConfig(db, "new_key", "new_value", "A new key",);
    const entry = await getConfig(db, "new_key",);
    expect(entry,).toBeDefined();
    expect(entry!.value,).toBe("new_value",);
    expect(entry!.description,).toBe("A new key",);
  });

  test("updates existing config entry", async () => {
    await setConfig(db, "new_key", "updated_value",);
    const entry = await getConfig(db, "new_key",);
    expect(entry!.value,).toBe("updated_value",);
  });
});

describe("deleteConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await db.insertInto("system_config",).values({ key: "delete_me", value: "bye", },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("deletes config entry", async () => {
    await deleteConfig(db, "delete_me",);
    const entry = await getConfig(db, "delete_me",);
    expect(entry,).toBeUndefined();
  });
});
