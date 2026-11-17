// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { deleteConfig, setConfig, } from "../admin/config";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY,
  LLAMA_SWAP_AUTOSTART_ENABLED_KEY,
  LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY,
  readEffectiveLlamaSwapConfig,
} from "./llama-swap-effective-config";

let fixture: TestDb;
let db: Kysely<DB>;
const file = { enabled: true, configPath: "/etc/llama-swap.yaml", listenPort: 8080, };

beforeAll(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterAll(async () => {
  await destroyTestDb(fixture,);
},);

beforeEach(async () => {
  await Promise.all([
    LLAMA_SWAP_AUTOSTART_ENABLED_KEY,
    LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY,
    LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY,
  ].map((key,) => deleteConfig(db, key,)),);
},);

describe("readEffectiveLlamaSwapConfig", () => {
  test("uses file config when there are no overrides", async () => {
    expect(await readEffectiveLlamaSwapConfig(db, file,),).toEqual(file,);
  });

  test("stored overrides win over file config", async () => {
    await setConfig(db, LLAMA_SWAP_AUTOSTART_ENABLED_KEY, "false", "test",);
    await setConfig(db, LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY, "/srv/swap.yml", "test",);
    await setConfig(db, LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY, "9090", "test",);
    expect(await readEffectiveLlamaSwapConfig(db, file,),).toEqual({
      enabled: false,
      configPath: "/srv/swap.yml",
      listenPort: 9090,
    },);
  });

  test("malformed overrides fall through to file config", async () => {
    await setConfig(db, LLAMA_SWAP_AUTOSTART_ENABLED_KEY, "maybe", "test",);
    await setConfig(db, LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY, "70000", "test",);
    expect(await readEffectiveLlamaSwapConfig(db, file,),).toEqual(file,);
  });

  test("returns undefined when nothing is configured", async () => {
    const emptyFixture = await createTestDb();
    try {
      expect(await readEffectiveLlamaSwapConfig(emptyFixture.db,),).toBeUndefined();
    } finally {
      await destroyTestDb(emptyFixture,);
    }
  });
});
