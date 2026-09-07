/**
 * Tests for admin/config.ts — System Config CRUD
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { deleteConfig, getAllConfig, getConfig, seedDefaults, setConfig, } from "./config";

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

describe("seedDefaults", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("seedDefaults is idempotent (no throw on second call)", async () => {
    const cfg = {
      auth: {
        registrationOpen: true,
        sessionTimeoutHours: 24,
        maxSessionsPerUser: 5,
      },
      assets: { maxFileSize: 10485760, },
      generation: {
        defaultProvider: "openai",
        defaultModels: { openai: "gpt-4o-mini", },
      },
    } as unknown as Config;
    await seedDefaults(db, cfg,);
    await expect(seedDefaults(db, cfg,),).resolves.toBeUndefined();
  });

  test("all 11 default keys present after seedDefaults", async () => {
    const cfg = {
      auth: {
        registrationOpen: true,
        sessionTimeoutHours: 24,
        maxSessionsPerUser: 5,
      },
      assets: { maxFileSize: 10485760, },
      generation: {
        defaultProvider: "openai",
        defaultModels: { openai: "gpt-4o-mini", },
      },
    } as unknown as Config;
    await seedDefaults(db, cfg,);
    const rows = await db.selectFrom("system_config",).selectAll().execute();
    const keys = rows.map((r,) => r.key);
    const expectedKeys = [
      "registration_open",
      "session_timeout_hours",
      "max_sessions_per_user",
      "max_upload_size_bytes",
      "log_retention_days",
      "default_provider",
      "default_model",
      "auto_moderation",
      "profanity_filter",
      "spam_detection",
      "max_flags_before_hide",
    ];
    for (const k of expectedKeys) {
      expect(keys,).toContain(k,);
    }
  });
  test("seeded values match the config passed to seedDefaults", async () => {
    const cfg = {
      auth: {
        registrationOpen: true,
        sessionTimeoutHours: 24,
        maxSessionsPerUser: 5,
      },
      assets: { maxFileSize: 10485760, },
      generation: {
        defaultProvider: "openai",
        defaultModels: { openai: "gpt-4o-mini", },
      },
    } as unknown as Config;
    await seedDefaults(db, cfg,);
    // Verify seeded values match what seedDefaults writes from the config
    const authEnabled = await getConfig(db, "registration_open",);
    expect(authEnabled?.value,).toBe("true",);
    const sessionTimeout = await getConfig(db, "session_timeout_hours",);
    expect(sessionTimeout?.value,).toBe("24",);
    const maxSessions = await getConfig(db, "max_sessions_per_user",);
    expect(maxSessions?.value,).toBe("5",);
    const maxUpload = await getConfig(db, "max_upload_size_bytes",);
    expect(maxUpload?.value,).toBe("10485760",);
    const logRetention = await getConfig(db, "log_retention_days",);
    expect(logRetention?.value,).toBe("90",);
    const defaultProvider = await getConfig(db, "default_provider",);
    expect(defaultProvider?.value,).toBe("openai",);
    const defaultModel = await getConfig(db, "default_model",);
    expect(defaultModel?.value,).toBe("gpt-4o-mini",);
    const autoMod = await getConfig(db, "auto_moderation",);
    expect(autoMod?.value,).toBe("false",);
    const profanity = await getConfig(db, "profanity_filter",);
    expect(profanity?.value,).toBe("false",);
    const spam = await getConfig(db, "spam_detection",);
    expect(spam?.value,).toBe("false",);
    const maxFlags = await getConfig(db, "max_flags_before_hide",);
    expect(maxFlags?.value,).toBe("3",);
  });

  describe("seedDefaults with partial config", () => {
    let db: Kysely<DB>;

    beforeAll(async () => {
      createLogger({ level: "warn", },);
      ({ db, } = await createTestDb());
    },);

    afterAll(async () => {
      await db.destroy();
    },);

    beforeEach(async () => {
      await db.deleteFrom("system_config",).execute();
    },);

    test("empty config resolves without throwing and seeds only non-config defaults", async () => {
      await expect(seedDefaults(db, {} as Config,),).resolves.toBeUndefined();
      const rows = await db.selectFrom("system_config",).selectAll().execute();
      const keys = rows.map((r,) => r.key);
      for (
        const k of [
          "log_retention_days",
          "auto_moderation",
          "profanity_filter",
          "spam_detection",
          "max_flags_before_hide",
        ]
      ) {
        expect(keys,).toContain(k,);
      }
      for (
        const k of [
          "registration_open",
          "session_timeout_hours",
          "max_sessions_per_user",
          "max_upload_size_bytes",
          "default_provider",
          "default_model",
        ]
      ) {
        expect(keys,).not.toContain(k,);
      }
    });

    test("missing generation skips provider/model keys but seeds auth keys", async () => {
      const cfg = {
        auth: {
          registrationOpen: true,
          sessionTimeoutHours: 24,
          maxSessionsPerUser: 5,
        },
        assets: { maxFileSize: 10485760, },
      } as unknown as Config;
      await expect(seedDefaults(db, cfg,),).resolves.toBeUndefined();
      const rows = await db.selectFrom("system_config",).selectAll().execute();
      const keys = rows.map((r,) => r.key);
      for (
        const k of [
          "registration_open",
          "session_timeout_hours",
          "max_sessions_per_user",
          "max_upload_size_bytes",
        ]
      ) {
        expect(keys,).toContain(k,);
      }
      expect(keys,).not.toContain("default_provider",);
      expect(keys,).not.toContain("default_model",);
    });

    test("missing auth skips auth/asset keys but seeds provider/model keys", async () => {
      const cfg = {
        generation: {
          defaultProvider: "openai",
          defaultModels: { openai: "gpt-4o-mini", },
        },
      } as unknown as Config;
      await expect(seedDefaults(db, cfg,),).resolves.toBeUndefined();
      const rows = await db.selectFrom("system_config",).selectAll().execute();
      const keys = rows.map((r,) => r.key);
      expect(keys,).toContain("default_provider",);
      expect(keys,).toContain("default_model",);
      for (
        const k of [
          "registration_open",
          "session_timeout_hours",
          "max_sessions_per_user",
          "max_upload_size_bytes",
        ]
      ) {
        expect(keys,).not.toContain(k,);
      }
    });

    test("missing defaultModels seeds default_model as empty string", async () => {
      const cfg = {
        generation: { defaultProvider: "openai", },
      } as unknown as Config;
      await expect(seedDefaults(db, cfg,),).resolves.toBeUndefined();
      const provider = await getConfig(db, "default_provider",);
      expect(provider?.value,).toBe("openai",);
      const model = await getConfig(db, "default_model",);
      expect(model?.value,).toBe("",);
    });
  });
});
