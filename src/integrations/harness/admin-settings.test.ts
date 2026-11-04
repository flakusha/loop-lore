// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * admin-settings store tests: layering (file flag vs override), stored-row
 * leniency, and the save round-trip — valid acknowledgements pass
 * `validateAcpProfiles` and persist; non-boolean values throw before
 * anything is written (TASK-harness-tos-acknowledgement-frontend-confirmation
 * contract for the "existing config save path").
 *
 * Serial-by-file: the module-level settings singleton is shared, so every
 * case resets it first.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, } from "bun:test";
import { deleteConfig, getConfigValue, } from "../../admin/config";
import { type HarnessConfig, } from "../../config/schema/harness";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  getHarnessAdminFileConfig,
  getHarnessAdminSettings,
  HARNESS_SETTINGS_ACKS_KEY,
  HARNESS_SETTINGS_ENABLED_KEY,
  harnessAdminSettings,
  initHarnessAdminSettings,
  isHarnessAdminSettingsSeeded,
  resetHarnessAdminSettings,
  saveHarnessAdminSettings,
} from "./admin-settings";

const FILE_CONFIG: HarnessConfig = {
  acp: {
    enabled: false,
    profiles: [
      {
        name: "omp-main",
        command: ["omp", "acp",],
        tiers: { good: { model: "test-provider/test-model", capabilities: ["tools",], }, },
      },
      {
        name: "codex-sub",
        command: ["codex", "--acp",],
        harness: "codex",
        tiers: { good: { model: "test-provider/test-model", capabilities: ["tools",], }, },
      },
      {
        name: "ack-in-file",
        command: ["omp", "acp",],
        tiers: { good: { model: "test-provider/test-model", capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },
    ],
  },
};

describe("harness admin settings store", () => {
  let fixture: TestDb;

  beforeAll(async () => {
    fixture = await createTestDb();
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  it("unseeded view falls back to defaults", () => {
    resetHarnessAdminSettings();
    const view = getHarnessAdminSettings();
    expect(view.enabled,).toBe(false,);
    expect(view.profiles,).toEqual([],);
  });

  it("layers the stored override over the file flag", () => {
    initHarnessAdminSettings(FILE_CONFIG.acp,);
    const view = getHarnessAdminSettings();
    expect(view.enabled,).toBe(false,);
    expect(view.profiles.find((p,) => p.name === "omp-main")?.tosGrayzoneAcknowledged,).toBe(false,);
    expect(view.profiles.find((p,) => p.name === "ack-in-file")?.tosGrayzoneAcknowledged,).toBe(true,);
    expect(view.profiles.find((p,) => p.name === "ack-in-file")?.flavor,).toBe("omp",);
    expect(view.profiles.find((p,) => p.name === "codex-sub")?.flavor,).toBe("codex",);
  });

  it("exposes the raw file layer and the singleton behind the accessors", () => {
    resetHarnessAdminSettings();
    initHarnessAdminSettings(FILE_CONFIG.acp,);

    expect(getHarnessAdminFileConfig(),).toBe(FILE_CONFIG.acp,);
    expect(getHarnessAdminSettings(),).toEqual(harnessAdminSettings.get(),);
  });

  it("save round-trips valid acknowledgements through validateAcpProfiles and persists them", async () => {
    resetHarnessAdminSettings();
    initHarnessAdminSettings(FILE_CONFIG.acp,);

    const view = await saveHarnessAdminSettings(fixture.db, { acknowledgements: { "codex-sub": true, }, },);
    expect(view.profiles.find((p,) => p.name === "codex-sub")?.tosGrayzoneAcknowledged,).toBe(true,);

    const stored = await getConfigValue(fixture.db, HARNESS_SETTINGS_ACKS_KEY,);
    expect(stored,).toBe(JSON.stringify({ "codex-sub": true, },),);
  });

  it("persists the enable override as a string row", async () => {
    resetHarnessAdminSettings();
    initHarnessAdminSettings(FILE_CONFIG.acp,);

    const view = await saveHarnessAdminSettings(fixture.db, { enabled: true, },);
    expect(view.enabled,).toBe(true,);
    expect(await getConfigValue(fixture.db, HARNESS_SETTINGS_ENABLED_KEY,),).toBe("true",);
  });

  it("rejects a non-boolean acknowledgement before anything persists", async () => {
    resetHarnessAdminSettings();
    initHarnessAdminSettings(FILE_CONFIG.acp,);
    await deleteConfig(fixture.db, HARNESS_SETTINGS_ACKS_KEY,);

    let threw = "";
    try {
      await saveHarnessAdminSettings(fixture.db, { acknowledgements: { "codex-sub": "yes", }, },);
    } catch (error) {
      threw = String(error,);
    }

    expect(threw,).toContain("boolean",);
    expect(await getConfigValue(fixture.db, HARNESS_SETTINGS_ACKS_KEY,),).toBeUndefined();
    expect(getHarnessAdminSettings().profiles.find((p,) => p.name === "codex-sub")?.tosGrayzoneAcknowledged,).toBe(
      false,
    );
  });

  it("rejects acknowledgements for unknown profile names", async () => {
    resetHarnessAdminSettings();
    initHarnessAdminSettings(FILE_CONFIG.acp,);
    await deleteConfig(fixture.db, HARNESS_SETTINGS_ACKS_KEY,);

    let threw = "";
    try {
      await saveHarnessAdminSettings(fixture.db, { acknowledgements: { "no-such-profile": true, }, },);
    } catch (error) {
      threw = String(error,);
    }

    expect(threw,).toContain("no configured profile named",);
    expect(await getConfigValue(fixture.db, HARNESS_SETTINGS_ACKS_KEY,),).toBeUndefined();
  });

  it("re-confirming the same acknowledgement is idempotent", async () => {
    resetHarnessAdminSettings();
    initHarnessAdminSettings(FILE_CONFIG.acp,);

    const first = await saveHarnessAdminSettings(fixture.db, { acknowledgements: { "codex-sub": true, }, },);
    const second = await saveHarnessAdminSettings(fixture.db, { acknowledgements: { "codex-sub": true, }, },);
    expect(second,).toEqual(first,);
    expect(await getConfigValue(fixture.db, HARNESS_SETTINGS_ACKS_KEY,),).toBe(
      JSON.stringify({ "codex-sub": true, },),
    );
  });
});

// Resource contract: in-memory store singleton only — reset in afterEach so
// a failed case cannot leak into siblings; no DB, no ports.
describe("isHarnessAdminSettingsSeeded", () => {
  afterEach(() => {
    resetHarnessAdminSettings();
  },);

  it("is false before seeding and true after", () => {
    resetHarnessAdminSettings();
    expect(isHarnessAdminSettingsSeeded(),).toBe(false,);
    initHarnessAdminSettings({ enabled: false, profiles: [], },);
    expect(isHarnessAdminSettingsSeeded(),).toBe(true,);
  });
});
