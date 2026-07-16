/**
 * E2E Test Server
 *
 * Spins up Bun.serve on a random port using the Elysia app (createApp).
 * Call createTestServer() in setup, use the returned URL for fetch calls.
 */

import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createSqliteDialect, setTestDatabase } from "@/db/index";
import { up as migrate } from "@/db/migrations/001_init";
import "./logger-init";
import { createApp } from "@/elysia-app";
import { loadConfig } from "@/config/load";
import { createLogger, setGlobalLogger } from "@/logger";
import { initAgeGate } from "@/age-gate/controller";
import { initializeProviders, registerProvider, getProvider } from "@/generation";
import { MockLLMProvider } from "@/test-utils/mock-provider";
import { initSmk } from "@/crypto";
import { resetLoginRateLimiter } from "@/routes/auth";
import type { DB } from "@/db/schema";
import type { Config } from "@/config/schema";
import { resetSoloUserCache } from "@/middleware/index";

export interface TestServer {
  url: string;
  db: Kysely<DB>;
  config: Config;
  mockProvider: MockLLMProvider | null;
  close: () => void;
}

/**
 * Create an in-memory SQLite database with full schema.
 */
export function createTestDb(): Kysely<DB> {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  const dialect = createSqliteDialect(sqlite);
  const db = new Kysely<DB>({ dialect });

  // Override global DB so all getDatabase() calls resolve to test DB
  setTestDatabase(db);

  return db;
}

/**
 * Run the init migration on a test database.
 */
export async function runMigrations(db: Kysely<DB>): Promise<void> {
  await migrate(db as unknown as Kysely<unknown>);
}

/**
 * E2E_SAFEGUARD: prevent accidental runs against real data.
 * When E2E_SAFEGUARD=1 (default), validates DB is :memory: and
 * upload dir is under /tmp/. Logs warnings for each check.
 * Set E2E_SAFEGUARD=0 to bypass.
 */
function enforceE2eSafeguard(config: Config): void {
  const safeguard = process.env.E2E_SAFEGUARD ?? "1";
  if (safeguard === "0") {
    console.warn("[E2E_SAFEGUARD=0] Safety checks bypassed — ensure you are not pointed at real data");
    return;
  }

  const issues: string[] = [];

  if (config.db.sqliteFilename !== ":memory:") {
    issues.push(`db.sqliteFilename is "${config.db.sqliteFilename}", expected ":memory:"`);
  }

  if (!config.assets.uploadDir?.startsWith("/tmp/")) {
    issues.push(`assets.uploadDir is "${config.assets.uploadDir}", expected under /tmp/`);
  }

  if (config.auth.required) {
    issues.push("auth.required is true, expected false for isolated e2e");
  }

  if (issues.length > 0) {
    const msg = [
      "[E2E_SAFEGUARD] Refusing to run: test config would touch real data.",
      ...issues.map((i) => `  - ${i}`),
      "Use config.e2e.yaml (db.sqliteFilename: ':memory:') or set E2E_SAFEGUARD=0 to bypass.",
    ].join("\n");
    throw new Error(msg);
  }

  console.log("[E2E_SAFEGUARD] Config is safe (:memory: DB, /tmp/ uploads, auth disabled)");
}

/**
 * Load config with test-safe overrides.
 *
 * When E2E_SAFEGUARD env is 1 (default): verifies DB is :memory:,
 * upload dir is under /tmp/, and auth is disabled. Prevents
 * accidental runs against real data.
 *
 * Port 0 = random free port.
 * @param overrides Optional partial config overrides (merged on top of defaults).
 */
export function loadTestConfig(overrides?: Partial<Config>): Config {
  const config = loadConfig();
  // Apply safe defaults BEFORE safeguard check so real config
  // values (real DB path, real upload dir) don't trigger rejection.
  config.server.port = 0;
  config.db.sqliteFilename = ":memory:";
  config.assets.enabled = true;
  config.assets.maxFileSize = 10 * 1024 * 1024; // 10 MB
  config.assets.uploadDir = "/tmp/loop-lore-e2e-placeholder";
  config.auth.required = false;
  enforceE2eSafeguard(config);

  if (overrides) {
    // Deep merge auth overrides
    if (overrides.auth) Object.assign(config.auth, overrides.auth);
    // Deep merge server overrides
    if (overrides.server) Object.assign(config.server, overrides.server);
    // Deep merge assets overrides
    if (overrides.assets) Object.assign(config.assets, overrides.assets);
    // Deep merge ageGate overrides
    if (overrides.ageGate) Object.assign(config.ageGate, overrides.ageGate);
    // Deep merge byoKey overrides
    if (overrides.byoKey) Object.assign(config.byoKey, overrides.byoKey);
    // Deep merge encryption overrides
    if (overrides.encryption) Object.assign(config.encryption, overrides.encryption);
    // Deep merge generation overrides (providers, models, defaultProvider)
    if (overrides.generation) config.generation = mergeGeneration(config.generation, overrides.generation);
    // Deep merge testing overrides
    if (overrides.testing) config.testing = { ...config.testing, ...overrides.testing };
  }

  return config;
}

/**
 * Deep-merge generation config overrides.
 * Recursively merges providers and defaultModels instead of replacing.
 */
function mergeGeneration(base: Config["generation"], overrides: Partial<Config["generation"]>): Config["generation"] {
  const result = { ...base };
  if (overrides.providers) {
    result.providers = { ...base.providers };
    for (const [key, val] of Object.entries(overrides.providers)) {
      if (Array.isArray(val)) {
        // openaiCompatible is an array — deep merge
        result.providers[key as keyof typeof result.providers] = val as never;
      } else if (val && typeof val === "object") {
        result.providers[key as keyof typeof result.providers] = { ...(base.providers as never)[key], ...val } as never;
      }
    }
  }
  if (overrides.defaultProvider != null) result.defaultProvider = overrides.defaultProvider;
  if (overrides.defaultModels) result.defaultModels = { ...base.defaultModels, ...overrides.defaultModels };
  return result;
}

/**
 * Create and start a test server on a random port.
 * @param overrides Optional partial config overrides (e.g. { auth: { required: true } }).
 * @param registerMock Whether to auto-register MockLLMProvider as "mock-provider" (for generation e2e).
 * Returns { url, db, config, mockProvider, close }.
 *
 * Usage:
 *   const server = await createTestServer();
 *   const res = await fetch(`${server.url}/api/auth/me`);
 *   server.close();
 */
export async function createTestServer(
  overrides?: Partial<Config>,
  registerMock = false,
): Promise<TestServer> {
  const db = createTestDb();
  await runMigrations(db);

  const config = loadTestConfig(overrides);

  // Create temp upload dir under /tmp/ — NEVER in project dir or user home
  const testRunId = `loop-lore-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testUploadDir = resolve("/tmp", testRunId, "uploads");
  config.assets.uploadDir = testUploadDir;
  mkdirSync(testUploadDir, { recursive: true });

  // Initialize logger + age gate (singletons)
  const logger = createLogger({ level: "error" });
  setGlobalLogger(logger);
  initAgeGate(config.ageGate);
  // Reset SMK from any prior unit tests — test config has no encryption key
  await initSmk(config.encryption);

  // Initialize providers from config (real or mock)
  let mockProvider: MockLLMProvider | null = null;
  if (registerMock) {
    mockProvider = new MockLLMProvider();
    registerProvider("mock-provider", mockProvider);
    // Use the actual instance from registry (may be pre-existing from other tests)
    mockProvider = getProvider("mock-provider") as MockLLMProvider ?? mockProvider;
    if (!config.generation.defaultProvider) {
      config.generation.defaultProvider = "mock-provider";
    }
    if (!config.generation.defaultModels["mock-provider"]) {
      config.generation.defaultModels["mock-provider"] = "mock-model";
    }
  }
  initializeProviders(config);

  const bunServer = Bun.serve({
    port: 0,
    fetch: createApp({
      database: db,
      config,
      handleNonApiRequest: async () => new Response("Not found", { status: 404 }),
    }).fetch,
  });

  const url = `http://localhost:${bunServer.port}`;

  return {
    url,
    db,
    config,
    mockProvider,
    close: () => {
      bunServer.stop();
      setTestDatabase(null);
      resetSoloUserCache();
      // Reset process-global login rate limiter so each test file starts fresh
      resetLoginRateLimiter();
      // Clean up temp upload directory
      const testDir = resolve("/tmp", testRunId);
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    },
  };
}
