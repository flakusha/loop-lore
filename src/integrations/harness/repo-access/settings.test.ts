// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// repo-access/settings.test.ts — the master-switch store layering.
//
// Resource contract (parallel-safe): one :memory: SQLite per file via
// createTestDb, the singleton store reset per test, no ports/env/sleeps.
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { deleteConfig, getConfigValue, } from "../../../admin/config";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import {
  applyStoredRepoAccessSettings,
  getRepoAccessSettings,
  initRepoAccessSettings,
  REPO_ACCESS_SETTINGS_ENABLED_KEY,
  resetRepoAccessSettings,
  saveRepoAccessSettings,
} from "./settings";

let fixture: TestDb;

beforeEach(async () => {
  fixture = await createTestDb();
  resetRepoAccessSettings();
},);

afterEach(async () => {
  resetRepoAccessSettings();
  await destroyTestDb(fixture,);
},);

describe("repo-access settings — the dangerous-capability master switch", () => {
  it("reads disabled when the store was never seeded (fail-closed)", async () => {
    expect(getRepoAccessSettings().enabled,).toBe(false,);
  });

  it("seeds disabled from an absent file section", async () => {
    initRepoAccessSettings(undefined,);
    expect(getRepoAccessSettings().enabled,).toBe(false,);
  });

  it("seeds the file layer and lets the override win", async () => {
    initRepoAccessSettings({ enabled: true, },);
    expect(getRepoAccessSettings().enabled,).toBe(true,);

    // An admin override of false suppresses an enabled file config.
    await saveRepoAccessSettings(fixture.db, { enabled: false, },);
    expect(getRepoAccessSettings().enabled,).toBe(false,);
  });

  it("persists through system_config and re-applies at boot", async () => {
    initRepoAccessSettings({ enabled: false, },);
    await saveRepoAccessSettings(fixture.db, { enabled: true, },);

    expect(await getConfigValue(fixture.db, REPO_ACCESS_SETTINGS_ENABLED_KEY,),).toBe("true",);

    // Boot replay: fresh store (file layer only) + stored override -> enabled.
    resetRepoAccessSettings();
    initRepoAccessSettings({ enabled: false, },);
    await applyStoredRepoAccessSettings(fixture.db,);
    expect(getRepoAccessSettings().enabled,).toBe(true,);
  });

  it("an absent stored row leaves the file layer untouched", async () => {
    initRepoAccessSettings({ enabled: true, },);
    await applyStoredRepoAccessSettings(fixture.db,);
    expect(getRepoAccessSettings().enabled,).toBe(true,);
  });

  it("a deleted row drops back to the file layer", async () => {
    initRepoAccessSettings({ enabled: false, },);
    await saveRepoAccessSettings(fixture.db, { enabled: true, },);
    await deleteConfig(fixture.db, REPO_ACCESS_SETTINGS_ENABLED_KEY,);

    resetRepoAccessSettings();
    initRepoAccessSettings({ enabled: false, },);
    await applyStoredRepoAccessSettings(fixture.db,);
    expect(getRepoAccessSettings().enabled,).toBe(false,);
  });
});
