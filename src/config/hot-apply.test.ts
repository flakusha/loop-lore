// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { ageGateConfig, } from "../age-gate/controller";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { getRuntimeNsfwConfig, resetNsfwRuntimeConfig, } from "../nsfw/runtime-config";
import {
  applyConfigChange,
  applyConfigWrite,
  classifyConfigPath,
  initConfigHotApply,
  onConfigChange,
  resetConfigHotApply,
  type ConfigChange,
} from "./hot-apply";
import { applyHotConfig, } from "./hot-apply-consumers";
import type { Config, } from "./schema/config";
import { createConfigSchema, } from "./schema-class";

function makeConfig(): Config {
  return structuredClone(createConfigSchema().defaults,) as Config;
}

beforeEach(() => {
  // Force a known permissive root so a level change is observable, and wire
  // the live consumer exactly the way src/server/start.ts does.
  setGlobalLogger(createLogger({ level: "debug", },),);
  initConfigHotApply(makeConfig(),);
  onConfigChange(applyHotConfig,);
},);

afterEach(() => {
  resetConfigHotApply();
  resetNsfwRuntimeConfig();
  getLogger().setLevel("error",);
},);

describe("classifyConfigPath", () => {
  test("registry entries are hot-applicable", () => {
    expect(classifyConfigPath("logging.level",),).toBe("hot",);
    expect(classifyConfigPath("nsfw.allowNsfw",),).toBe("hot",);
    expect(classifyConfigPath("ageGate.enabled",),).toBe("hot",);
  },);

  test("restart-required bindings default to restart", () => {
    expect(classifyConfigPath("default_provider",),).toBe("restart",);
    expect(classifyConfigPath("default_model",),).toBe("restart",);
    expect(classifyConfigPath("registration_open",),).toBe("restart",);
  },);
},);

describe("applyConfigChange", () => {
  test("first call after init seeds the snapshot without emitting", () => {
    const changes: ConfigChange[] = [];
    onConfigChange((change,) => { changes.push(change,); },);
    const change = applyConfigChange("boot", makeConfig(),);
    expect(changes.length,).toBe(0,);
    expect(change.changedPaths,).toEqual([],);
    expect(change.requiresRestart,).toBe(false,);
  },);

  test("diffs changed leaves and classifies them", () => {
    const config = makeConfig();
    config.logging.level = "warn";
    config.nsfw.allowNsfw = false;
    const change = applyConfigChange("logging", config,);
    expect(change.changedPaths,).toContain("logging.level",);
    expect(change.changedPaths,).toContain("nsfw.allowNsfw",);
    expect(change.hotPaths,).toContain("logging.level",);
    expect(change.hotPaths,).toContain("nsfw.allowNsfw",);
    expect(change.requiresRestart,).toBe(false,);
  },);

  test("subscribers receive the change", () => {
    const seen: ConfigChange[] = [];
    onConfigChange((change,) => { seen.push(change,); },);
    const config = makeConfig();
    config.ageGate.enabled = true;
    applyConfigChange("age-gate", config,);
    expect(seen.length,).toBe(1,);
    const first = seen[0];
    expect(first?.domain,).toBe("age-gate",);
    expect(first?.hotPaths,).toContain("ageGate.enabled",);
  },);
},);

describe("applyHotConfig", () => {
  test("applies logging.level live without a restart", async () => {
    const entries: number[] = [];
    getLogger().addTransport({
      name: "probe",
      write: async (entry) => { entries.push(entry.level,); },
      flush: async () => {},
    },);

    const config = makeConfig();
    config.logging.level = "error";
    applyConfigChange("logging", config,);

    getLogger().debug("suppressed",);
    getLogger().error("emitted",);
    await getLogger().flush();

    expect(entries,).not.toContain(10,);
    expect(entries,).toContain(40,);
  },);

  test("children created before setLevel see the new level", async () => {
    const entries: number[] = [];
    const root = getLogger();
    const child = root.child({ module: "test", },);
    child.addTransport({
      name: "probe",
      write: async (entry) => { entries.push(entry.level,); },
      flush: async () => {},
    },);

    root.setLevel("error",);

    child.debug("suppressed",);
    child.error("emitted",);
    await child.flush();

    expect(entries,).not.toContain(10,);
    expect(entries,).toContain(40,);
  },);

  test("applies ageGate.enabled live", () => {
    const config = makeConfig();
    config.ageGate.enabled = true;
    config.ageGate.minimumAge = 21;
    applyConfigChange("age-gate", config,);
    expect(ageGateConfig.get().enabled,).toBe(true,);
    expect(ageGateConfig.get().minimumAge,).toBe(21,);
  },);

  test("applies nsfw.allowNsfw live", () => {
    const config = makeConfig();
    config.nsfw.allowNsfw = false;
    applyConfigChange("nsfw", config,);
    expect(getRuntimeNsfwConfig().allowNsfw,).toBe(false,);
  },);
});

describe("applyConfigWrite", () => {
  test("hot path applies live and returns true", () => {
    const applied = applyConfigWrite("ageGate.enabled", "true",);
    expect(applied,).toBe(true,);
    expect(ageGateConfig.get().enabled,).toBe(true,);
  });

  test("coerces string value to the leaf type", () => {
    const applied = applyConfigWrite("nsfw.allowNsfw", "false",);
    expect(applied,).toBe(true,);
    expect(getRuntimeNsfwConfig().allowNsfw,).toBe(false,);
  });

  test("restart-required key returns false and does not emit", () => {
    const changes: ConfigChange[] = [];
    const unsub = onConfigChange((c,) => { changes.push(c,); },);
    const applied = applyConfigWrite("server.port", "8080",);
    expect(applied,).toBe(false,);
    expect(changes.length,).toBe(0,);
    unsub();
  });

  test("no snapshot returns false", () => {
    resetConfigHotApply();
    const applied = applyConfigWrite("logging.level", "error",);
    expect(applied,).toBe(false,);
  });
});
