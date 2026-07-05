/**
 * E2E Test Server
 *
 * Spins up Bun.serve on a random port using the real handleApiRequest.
 * Call createTestServer() in setup, use the returned URL for fetch calls.
 */

import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createSqliteDialect, setTestDatabase } from "@/db/index";
import { up as migrate } from "@/db/migrations/001_init";
import { handleApiRequest } from "@/server";
import { loadConfig } from "@/config/load";
import { createLogger, setGlobalLogger } from "@/logger";
import { initAgeGate } from "@/age-gate/controller";
import { initializeProviders, registerProvider, getProvider } from "@/generation";
import { MockLLMProvider } from "@/test-utils/mock-provider";
import { initSmk } from "@/crypto";
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
 * Load config with test-safe overrides.
 * Port 0 = random free port.
 * @param overrides Optional partial config overrides (merged on top of defaults).
 */
export function loadTestConfig(overrides?: Partial<Config>): Config {
  const config = loadConfig();
  config.server.port = 0;
  config.assets.enabled = true;
  config.assets.maxFileSize = 10 * 1024 * 1024; // 10 MB
  config.auth.required = false; // default: solo/demo mode

  if (overrides) {
    // Deep merge auth overrides
    if (overrides.auth) Object.assign(config.auth, overrides.auth);
    // Deep merge server overrides
    if (overrides.server) Object.assign(config.server, overrides.server);
    // Deep merge assets overrides
    if (overrides.assets) Object.assign(config.assets, overrides.assets);
    // Deep merge ageGate overrides
    if (overrides.ageGate) Object.assign(config.ageGate, overrides.ageGate);
    // Deep merge testing overrides
    if (overrides.testing) config.testing = { ...config.testing, ...overrides.testing };
  }

  return config;
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
    fetch: async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) {
        return handleApiRequest(req, db, config);
      }
      return new Response("Not found", { status: 404 });
    },
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
      // Clean up temp upload directory
      const testDir = resolve("/tmp", testRunId);
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    },
  };
}
