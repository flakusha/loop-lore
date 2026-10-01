// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/init-background-services.test.ts — Background boot work:
// character-template seeding plus auto-start of external AI servers
// (llama.cpp / llama-swap / sd.cpp). The server manager and logger are
// fakes; the character seed runs against a real in-memory database.

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import { getProvider, } from "../generation";
import { unregisterProvider, } from "../generation/providers/registry";
import type { Logger, } from "../logger/types";
import type { ServerExternalManager, } from "../services/server-external-manager";
import { createTestDb, } from "../test-utils/create-test-db";
import { initBackgroundServices, } from "./init-background-services";

// ── Fakes ────────────────────────────────────────────────────

interface LogCall {
  level: string;
  message: unknown;
}

function makeLogger(): { logger: Logger; calls: LogCall[] } {
  const calls: LogCall[] = [];
  const rec = (level: string,) => (message: unknown,): void => {
    calls.push({ level, message, },);
  };
  const logger = {
    trace: rec("trace",),
    debug: rec("debug",),
    info: rec("info",),
    warn: rec("warn",),
    error: rec("error",),
    fatal: rec("fatal",),
    child: () => logger,
    addTransport: () => {},
    setBindings: () => {},
    flush: async () => {},
  };
  return { logger: logger as unknown as Logger, calls, };
}

interface ManagerCalls {
  llamaCpp: unknown[];
  llamaSwap: unknown[];
  sdCpp: unknown[];
}

function makeManager(behavior: {
  llamaCpp?: { port: number; pid: number } | null;
  llamaSwap?: { port: number; pid: number } | null;
  sdCpp?: { port: number; pid: number } | null;
},): { manager: ServerExternalManager; calls: ManagerCalls } {
  const calls: ManagerCalls = { llamaCpp: [], llamaSwap: [], sdCpp: [], };
  const manager = {
    startLlamaCpp: async (cfg: unknown,) => {
      calls.llamaCpp.push(cfg,);
      return behavior.llamaCpp ?? null;
    },
    startLlamaSwap: async (cfg: unknown,) => {
      calls.llamaSwap.push(cfg,);
      return behavior.llamaSwap ?? null;
    },
    startSdCpp: async (cfg: unknown,) => {
      calls.sdCpp.push(cfg,);
      return behavior.sdCpp ?? null;
    },
  };
  return { manager: manager as unknown as ServerExternalManager, calls, };
}

// ── Fixtures ─────────────────────────────────────────────────

let db: Kysely<DB>;
let uploadDir: string;
let registeredProviders: string[] = [];

function makeConfig(overrides: {
  charactersEnabled?: boolean;
  autoStart?: Config["generation"]["autoStart"];
  defaultProvider?: string;
} = {},): Config {
  const config = structuredClone(createConfigSchema().defaults,) as Config;
  config.assets.uploadDir = uploadDir;
  if (overrides.charactersEnabled !== undefined) {
    config.characters.enabled = overrides.charactersEnabled;
  }
  config.generation.autoStart = overrides.autoStart;
  if (overrides.defaultProvider !== undefined) {
    config.generation.defaultProvider = overrides.defaultProvider;
  }
  return config;
}

async function countTemplateActors(): Promise<number> {
  const row = await db
    .selectFrom("actors",)
    .select((eb,) => eb.fn.countAll().as("n",))
    .where("import_spec", "=", "template",)
    .executeTakeFirst();
  return Number(row?.n ?? 0,);
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
  uploadDir = mkdtempSync(join(tmpdir(), "ll-bg-assets-",),);
  registeredProviders = [];
},);

afterEach(() => {
  rmSync(uploadDir, { recursive: true, force: true, },);
  for (const name of registeredProviders) { unregisterProvider(name,); }
},);

// ── Tests ────────────────────────────────────────────────────

describe("initBackgroundServices", () => {
  test("does nothing when characters are disabled and autoStart is unset", async () => {
    const { logger, calls, } = makeLogger();
    const { manager, calls: managerCalls, } = makeManager({},);
    await initBackgroundServices(
      db,
      makeConfig({ charactersEnabled: false, autoStart: undefined, },),
      logger,
      manager,
    );
    expect(managerCalls.llamaCpp,).toHaveLength(0,);
    expect(managerCalls.llamaSwap,).toHaveLength(0,);
    expect(managerCalls.sdCpp,).toHaveLength(0,);
    expect(await countTemplateActors(),).toBe(0,);
    expect(calls.some((c,) => c.level === "debug" && String(c.message,).includes("autoStart not configured",)),).toBe(
      true,
    );
  });

  test("seeds character templates when characters are enabled", async () => {
    const { logger, calls, } = makeLogger();
    const { manager, } = makeManager({},);
    await initBackgroundServices(db, makeConfig({ charactersEnabled: true, autoStart: undefined, },), logger, manager,);
    const seeded = await countTemplateActors();
    expect(seeded,).toBeGreaterThan(0,);
    const info = calls.find((c,) => c.level === "info" && String(c.message,).includes("character templates seeded",));
    expect(info,).toBeDefined();
  });

  test("character seeding is idempotent across boots", async () => {
    const { logger, calls, } = makeLogger();
    const { manager, } = makeManager({},);
    const config = makeConfig({ charactersEnabled: true, autoStart: undefined, },);
    await initBackgroundServices(db, config, logger, manager,);
    const first = await countTemplateActors();
    expect(first,).toBeGreaterThan(0,);

    calls.length = 0;
    await initBackgroundServices(db, config, logger, manager,);
    expect(await countTemplateActors(),).toBe(first,);
    // created === 0 on the second boot → no "seeded" info line.
    expect(calls.some((c,) => c.level === "info" && String(c.message,).includes("character templates seeded",)),).toBe(
      false,
    );
  });

  test("auto-starts llama.cpp and registers the provider under its alias", async () => {
    const { logger, } = makeLogger();
    const { manager, calls: managerCalls, } = makeManager({ llamaCpp: { port: 9011, pid: 42, }, },);
    const config = makeConfig({
      charactersEnabled: false,
      autoStart: { llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, alias: "mymodel", }, },
    },);
    await initBackgroundServices(db, config, logger, manager,);

    expect(managerCalls.llamaCpp,).toHaveLength(1,);
    // The auto-started server is reachable through the provider registry.
    registeredProviders.push("mymodel",);
    expect(getProvider("mymodel",),).toBeDefined();
    // No defaultProvider configured → the auto-started server becomes it.
    expect(config.generation.defaultProvider,).toBe("mymodel",);
    expect(config.generation.defaultModels["mymodel"],).toBe("mymodel",);
  });

  test("llama.cpp defaults to the name 'llama' when no alias is set", async () => {
    const { logger, } = makeLogger();
    const { manager, } = makeManager({ llamaCpp: { port: 9011, pid: 42, }, },);
    const config = makeConfig({
      charactersEnabled: false,
      autoStart: { llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, }, },
    },);
    await initBackgroundServices(db, config, logger, manager,);
    registeredProviders.push("llama",);
    expect(getProvider("llama",),).toBeDefined();
    expect(config.generation.defaultProvider,).toBe("llama",);
  });

  test("does not overwrite an existing defaultProvider", async () => {
    const { logger, } = makeLogger();
    const { manager, } = makeManager({ llamaCpp: { port: 9011, pid: 42, }, },);
    const config = makeConfig({
      charactersEnabled: false,
      defaultProvider: "existing",
      autoStart: { llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, alias: "mymodel", }, },
    },);
    await initBackgroundServices(db, config, logger, manager,);
    registeredProviders.push("mymodel",);
    expect(getProvider("mymodel",),).toBeDefined();
    expect(config.generation.defaultProvider,).toBe("existing",);
  });

  test("skips provider registration when llama.cpp fails to start", async () => {
    const { logger, } = makeLogger();
    const { manager, } = makeManager({ llamaCpp: null, },);
    const config = makeConfig({
      charactersEnabled: false,
      autoStart: { llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, alias: "broken", }, },
    },);
    await initBackgroundServices(db, config, logger, manager,);
    expect(getProvider("broken",),).toBeUndefined();
    expect(config.generation.defaultProvider,).toBe("",);
  });

  test("does not overwrite an existing defaultModels entry for the auto-started server", async () => {
    const { logger, } = makeLogger();
    const { manager, } = makeManager({ llamaCpp: { port: 9011, pid: 42, }, },);
    const config = makeConfig({
      charactersEnabled: false,
      autoStart: { llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, alias: "mymodel", }, },
    },);
    config.generation.defaultModels["mymodel"] = "preexisting";
    await initBackgroundServices(db, config, logger, manager,);
    registeredProviders.push("mymodel",);
    expect(getProvider("mymodel",),).toBeDefined();
    // ??= keeps the pre-existing model mapping.
    expect(config.generation.defaultModels["mymodel"],).toBe("preexisting",);
  });

  test("logs llama-swap readiness and failure", async () => {
    const ok = makeLogger();
    const okManager = makeManager({ llamaSwap: { port: 9012, pid: 7, }, },);
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: false,
        autoStart: { llamaSwap: { enabled: true, configPath: "/etc/llama-swap.yaml", }, },
      },),
      ok.logger,
      okManager.manager,
    );
    expect(ok.calls.some((c,) => c.level === "info" && String(c.message,).includes("llama-swap ready",)),).toBe(true,);

    const bad = makeLogger();
    const badManager = makeManager({ llamaSwap: null, },);
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: false,
        autoStart: { llamaSwap: { enabled: true, configPath: "/etc/llama-swap.yaml", }, },
      },),
      bad.logger,
      badManager.manager,
    );
    expect(
      bad.calls.some((c,) =>
        c.level === "warn" && String(c.message,).includes("llama-swap auto-start failed or skipped",)
      ),
    ).toBe(true,);
  });

  test("warns when sd-cpp fails to start and stays silent on success", async () => {
    const bad = makeLogger();
    const badManager = makeManager({ sdCpp: null, },);
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: false,
        autoStart: {
          sdCpp: { enabled: true, modelType: "checkpoint", modelPath: "/models/sd.safetensors", port: 9010, },
        },
      },),
      bad.logger,
      badManager.manager,
    );
    expect(
      bad.calls.some((c,) => c.level === "warn" && String(c.message,).includes("sd-cpp auto-start failed or skipped",)),
    ).toBe(true,);

    const good = makeLogger();
    const goodManager = makeManager({ sdCpp: { port: 9010, pid: 9, }, },);
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: false,
        autoStart: {
          sdCpp: { enabled: true, modelType: "checkpoint", modelPath: "/models/sd.safetensors", port: 9010, },
        },
      },),
      good.logger,
      goodManager.manager,
    );
    expect(good.calls.some((c,) => c.level === "warn"),).toBe(false,);
  });

  test("runs character seeding and all external server starts together", async () => {
    const { logger, } = makeLogger();
    const { manager, calls: managerCalls, } = makeManager({
      llamaCpp: { port: 9011, pid: 1, },
      llamaSwap: { port: 9012, pid: 2, },
      sdCpp: { port: 9010, pid: 3, },
    },);
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: true,
        autoStart: {
          llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, },
          llamaSwap: { enabled: true, configPath: "/etc/llama-swap.yaml", },
          sdCpp: { enabled: true, modelType: "checkpoint", modelPath: "/models/sd.safetensors", port: 9010, },
        },
      },),
      logger,
      manager,
    );
    expect(await countTemplateActors(),).toBeGreaterThan(0,);
    expect(managerCalls.llamaCpp,).toHaveLength(1,);
    expect(managerCalls.llamaSwap,).toHaveLength(1,);
    expect(managerCalls.sdCpp,).toHaveLength(1,);
  });

  test("autoStart present but nothing enabled launches no servers", async () => {
    const { logger, calls, } = makeLogger();
    const { manager, calls: managerCalls, } = makeManager({},);
    await initBackgroundServices(db, makeConfig({ charactersEnabled: false, autoStart: {}, },), logger, manager,);
    expect(managerCalls.llamaCpp,).toHaveLength(0,);
    expect(managerCalls.llamaSwap,).toHaveLength(0,);
    expect(managerCalls.sdCpp,).toHaveLength(0,);
    // The "not configured" debug line only fires when autoStart is falsy.
    expect(calls.some((c,) => String(c.message,).includes("autoStart not configured",)),).toBe(false,);
  });

  test("seeds templates even when an external server fails to start", async () => {
    const { logger, } = makeLogger();
    const { manager, } = makeManager({ llamaCpp: null, },);
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: true,
        autoStart: { llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, alias: "broken", }, },
      },),
      logger,
      manager,
    );
    // Seeding is independent of the server start — Promise.allSettled lets both settle.
    expect(await countTemplateActors(),).toBeGreaterThan(0,);
    // The failed server did not register a provider.
    expect(getProvider("broken",),).toBeUndefined();
  });

  test("passes the full llama.cpp config through to the manager", async () => {
    const { logger, } = makeLogger();
    const { manager, calls: managerCalls, } = makeManager({ llamaCpp: { port: 9011, pid: 42, }, },);
    const cfg = { enabled: true, modelPath: "/models/m.gguf", port: 9011, alias: "mymodel", };
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: false,
        autoStart: { llamaCpp: cfg, },
      },),
      logger,
      manager,
    );
    expect(managerCalls.llamaCpp,).toHaveLength(1,);
    expect(managerCalls.llamaCpp[0],).toEqual(cfg,);
  });

  test("starts llama-swap and sd-cpp when llama.cpp fails", async () => {
    const { logger, } = makeLogger();
    const { manager, calls: managerCalls, } = makeManager({
      llamaCpp: null,
      llamaSwap: { port: 9012, pid: 7, },
      sdCpp: { port: 9010, pid: 9, },
    },);
    await initBackgroundServices(
      db,
      makeConfig({
        charactersEnabled: false,
        autoStart: {
          llamaCpp: { enabled: true, modelPath: "/models/m.gguf", port: 9011, },
          llamaSwap: { enabled: true, configPath: "/etc/llama-swap.yaml", },
          sdCpp: { enabled: true, modelType: "checkpoint", modelPath: "/models/sd.safetensors", port: 9010, },
        },
      },),
      logger,
      manager,
    );
    // Promise.allSettled: one failure does not prevent the others from starting.
    expect(managerCalls.llamaCpp,).toHaveLength(1,);
    expect(managerCalls.llamaSwap,).toHaveLength(1,);
    expect(managerCalls.sdCpp,).toHaveLength(1,);
  });
});
