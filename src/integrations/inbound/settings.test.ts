// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * settings.test.ts — the inbound MCP/ACP settings store (§3.3 config
 * surface). Pins the deny-by-default contract and the override ladder.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per file
 * (createTestDb), no ports, no env; the singleton store is reset per test.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  applyStoredInboundSettings,
  getInboundSettings,
  INBOUND_SETTINGS_ACP_KEY,
  INBOUND_SETTINGS_MCP_KEY,
  INBOUND_SETTINGS_SCOPE_KEY,
  INBOUND_SETTINGS_USER_KEY,
  inboundSettings,
  initInboundSettings,
  isInboundSettingsSeeded,
  resetInboundSettings,
  saveInboundAdminSettings,
} from "./settings";

let testDb: TestDb;
let db: Kysely<DB>;

const FILE_LAYER = {
  mcpEnabled: false,
  acpEnabled: false,
  principalUserId: "",
  principalScope: "read" as const,
};

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
},);

beforeEach(() => {
  resetInboundSettings();
},);

afterAll(async () => {
  resetInboundSettings();
  await destroyTestDb(testDb,);
},);

describe("inbound settings store", () => {
  test("unseeded store reads deny-by-default and reports unseeded", () => {
    expect(isInboundSettingsSeeded(),).toBe(false,);
    const view = getInboundSettings();
    expect(view,).toEqual(FILE_LAYER,);
  });

  test("seeding the file layer keeps the deny-by-default defaults", () => {
    initInboundSettings(FILE_LAYER,);
    expect(isInboundSettingsSeeded(),).toBe(true,);
    expect(getInboundSettings(),).toEqual(FILE_LAYER,);
  });

  test("override layer wins over the file layer", async () => {
    initInboundSettings(FILE_LAYER,);
    await saveInboundAdminSettings(db, { acpEnabled: true, principalUserId: "op-1", },);
    expect(getInboundSettings().acpEnabled,).toBe(true,);
    expect(getInboundSettings().principalUserId,).toBe("op-1",);
    expect(getInboundSettings().mcpEnabled,).toBe(false,);
  });

  test("saveInboundAdminSettings rejects a scope outside the vocabulary", () => {
    initInboundSettings(FILE_LAYER,);
    expect(
      saveInboundAdminSettings(db, { principalScope: "admin" as never, },).then(() => true),
    ).rejects.toThrow("outside the read|chat-write vocabulary",);
  });

  test("applyStoredInboundSettings overlays persisted rows onto the store", async () => {
    initInboundSettings(FILE_LAYER,);

    await saveInboundAdminSettings(db, {
      mcpEnabled: true,
      acpEnabled: true,
      principalScope: "chat-write",
      principalUserId: "inbound-op",
    },);

    // A fresh store seeded from the (still-disabled) file layer, then the
    // persisted rows re-applied — the restart path.
    resetInboundSettings();
    initInboundSettings(FILE_LAYER,);
    expect(getInboundSettings().mcpEnabled,).toBe(false,);

    await applyStoredInboundSettings(db,);

    const view = getInboundSettings();
    expect(view.mcpEnabled,).toBe(true,);
    expect(view.acpEnabled,).toBe(true,);
    expect(view.principalScope,).toBe("chat-write",);
    expect(view.principalUserId,).toBe("inbound-op",);
    expect(INBOUND_SETTINGS_MCP_KEY,).toBe("integrations.inbound.mcp_enabled",);
    expect(INBOUND_SETTINGS_ACP_KEY,).toBe("integrations.inbound.acp_enabled",);
    expect(INBOUND_SETTINGS_SCOPE_KEY,).toBe("integrations.inbound.principal_scope",);
    expect(INBOUND_SETTINGS_USER_KEY,).toBe("integrations.inbound.principal_user_id",);
  });

  test("malformed persisted rows are ignored (defaults keep flowing)", async () => {
    initInboundSettings(FILE_LAYER,);

    const { setConfig, } = await import("../../admin/config");
    await setConfig(db, INBOUND_SETTINGS_SCOPE_KEY, "root",);
    await setConfig(db, INBOUND_SETTINGS_MCP_KEY, "yes",);

    await applyStoredInboundSettings(db,);

    const view = getInboundSettings();
    expect(view.mcpEnabled,).toBe(false,);
    expect(view.principalScope,).toBe("read",);
  });
});

describe("inboundSettings — the singleton behind the read path", () => {
  test("is the same store the read function consults (unseeded)", () => {
    expect(inboundSettings.isSeeded(),).toBe(false,);
    expect(inboundSettings.get(),).toEqual(getInboundSettings(),);
    expect(inboundSettings.get(),).toEqual(FILE_LAYER,);
  });

  test("mirrors the init → override → reset lifecycle", async () => {
    inboundSettings.init(FILE_LAYER,);
    expect(inboundSettings.isSeeded(),).toBe(true,);
    expect(inboundSettings.get().mcpEnabled,).toBe(false,);

    await saveInboundAdminSettings(db, { acpEnabled: true, principalUserId: "op-2", },);
    expect(inboundSettings.get().acpEnabled,).toBe(true,);
    expect(inboundSettings.get(),).toEqual(getInboundSettings(),);

    inboundSettings.reset();
    expect(inboundSettings.isSeeded(),).toBe(false,);
    expect(inboundSettings.get().acpEnabled,).toBe(false,);
  });
});
