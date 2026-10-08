// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stored plugin config read/write against a real in-memory `plugin_state`.
 *
 * `writeStoredPluginConfig` is reachable for a name the loader has never
 * persisted (the loader's own insert can fail), so the row it creates must not
 * carry approval. Covers that plus the status-preserving conflict path.
 * @module plugin-config-store-test
 */

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { defaultPluginStatus, readStoredPluginConfig, writeStoredPluginConfig, } from "./config-store";

describe("config-store", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = (await createTestDb()).db;
  });

  /**
   * @param name
   */
  async function rowFor(name: string,) {
    return await db
      .selectFrom("plugin_state",)
      .select(["status", "config_json",],)
      .where("name", "=", name,)
      .executeTakeFirst();
  }

  test("the origin default approves core and nothing else", () => {
    expect(defaultPluginStatus("core",),).toBe("active",);
    expect(defaultPluginStatus("community",),).toBe("disabled",);
    expect(defaultPluginStatus("local",),).toBe("disabled",);
  });

  test("a stored config round-trips", async () => {
    await writeStoredPluginConfig(db, "cfg-round-trip", { mode: "stored", }, "community",);

    expect(await readStoredPluginConfig(db, "cfg-round-trip",),).toEqual({ mode: "stored" });
  });

  test("an absent row reads as no override", async () => {
    expect(await readStoredPluginConfig(db, "cfg-absent",),).toEqual({});
  });

  test("a first write for an unknown name does not approve it", async () => {
    await writeStoredPluginConfig(db, "cfg-unapproved", { mode: "x", }, "community",);

    const row = await rowFor("cfg-unapproved",);

    expect(row?.status,).toBe("disabled",);
    expect(row?.config_json,).toBe(`{"mode":"x"}`);
  });

  test("a first write for a core plugin does not demote it", async () => {
    await writeStoredPluginConfig(db, "cfg-core", { mode: "z", }, "core",);

    const row = await rowFor("cfg-core",);

    expect(row?.status,).toBe("active",);
  });

  test("a later write preserves the row's existing status", async () => {
    await db
      .insertInto("plugin_state",)
      .values({ name: "cfg-approved", status: "active", },)
      .execute();

    await writeStoredPluginConfig(db, "cfg-approved", { mode: "y", }, "core",);

    const row = await rowFor("cfg-approved",);

    expect(row?.status,).toBe("active",);
    expect(await readStoredPluginConfig(db, "cfg-approved",),).toEqual({ mode: "y" });
  });
});
