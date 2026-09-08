// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Test Server
 *
 * Spins up Bun.serve on a random port using the Elysia app (createApp).
 * Call createTestServer() in setup, use the returned URL for fetch calls.
 */

import { createSqliteDialect, setTestDatabase, } from "@/db/index";
import { runMigrations as runAllMigrations, } from "@/db/migrate";
import { Database, } from "bun:sqlite";
import { type Dialect, Kysely, } from "kysely";
import { existsSync, mkdirSync, rmSync, } from "node:fs";
import { resolve, } from "node:path";
import "./logger-init";
import { initAgeGate, } from "@/age-gate/controller";
import type { Config, } from "@/config/schema";
import { createConfigSchema, } from "@/config/schema-class";
import { initSmk, } from "@/crypto";
import type { DB, } from "@/db/schema";
import { createApp, } from "@/elysia-app";
import { getProvider, initializeProviders, registerProvider, } from "@/generation";
import { createLogger, setGlobalLogger, } from "@/logger";
import { resetSoloUserCache, } from "@/middleware/index";
import { resetLoginRateLimiter, } from "@/routes/auth";
import { createRequestHandler, } from "@/server";
import { MockLLMProvider, } from "@/test-utils/mock-provider";

/**
 * Handle import route before Elysia (body consumed by Elysia otherwise).
 */

export async function _handleImportRequest(request: Request, database: Kysely<DB>, config: Config,): Promise<Response> {
  const { uid, safeJsonStringify, } = await import("@/utils");
  const { jsonError, jsonCreated, HttpStatus, } = await import("@/routes/http-utils");

  const userId = await resolveImportUserId(request, database, config,);
  if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

  const contentType = request.headers.get("content-type",) ?? "";
  if (!contentType.includes("multipart/form-data",)) {
    return jsonError({ message: "Expected multipart/form-data", status: HttpStatus.BadRequest, },);
  }

  const formData = await request.formData();
  const file = formData.get("file",);
  if (!file || !(file instanceof File)) {
    return jsonError({ message: "file field is required", status: HttpStatus.BadRequest, },);
  }

  const fileBytes = Buffer.from(await file.arrayBuffer(),);
  const filename = (file.name ?? "").toLowerCase();
  const parsed = await parseImportFile(fileBytes, filename, file,);
  if (!parsed) {
    return jsonError({
      message: "Unsupported file type. Use .json, .png, .yaml, or .toml",
      status: HttpStatus.BadRequest,
    },);
  }

  const displayName = (parsed.data.name ?? parsed.data.displayName ?? parsed.data.display_name) as string | undefined;
  if (!displayName) { return jsonError({ message: "Actor name is required", status: HttpStatus.BadRequest, },); }

  const id = uid();
  await database
    .insertInto("actors",)
    .values({
      id,
      actor_type: "character",
      display_name: displayName,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      description: (parsed.data.description as string | undefined) ?? null,
      system_prompt: (parsed.data.system_prompt as string | undefined) ?? null,
      welcome_message: (parsed.data.first_mes as string | undefined) ?? null,
      personality: (parsed.data.personality as string | undefined) ?? null,
      scenario: (parsed.data.scenario as string | undefined) ?? null,
      mes_example: (parsed.data.mes_example as string | undefined) ?? null,
      post_history_instructions: (parsed.data.post_history_instructions as string | undefined) ?? null,
      creator_notes: (parsed.data.creator_notes as string | undefined) ?? null,
      creator: (parsed.data.creator as string | undefined) ?? null,
      character_version: (parsed.data.character_version as string | undefined) ?? null,
      import_spec: parsed.spec ?? "raw",
      alternate_greetings: parsed.data.alternate_greetings
        ? (() => {
          const r = safeJsonStringify(parsed.data.alternate_greetings,);
          return r.ok ? r.value : null;
        })()
        : null,
      settings: "{}",
    },)
    .execute();
  return jsonCreated({ id, },);
}

/** Resolve the importing user from the session cookie, falling back to solo. */
async function resolveImportUserId(
  request: Request,
  database: Kysely<DB>,
  config: Config,
): Promise<string | null> {
  const crypto = await import("node:crypto");
  const cookieHeader = request.headers.get("Cookie",);
  const match = cookieHeader ? /ll_token=([^;]+)/.exec(cookieHeader,) : null;
  if (match) {
    const tokenHash = crypto.createHash("sha256",).update(match[1]!,).digest("hex",);
    const session = await database
      .selectFrom("sessions",)
      .select(["user_id",],)
      .where("token_hash", "=", tokenHash,)
      .executeTakeFirst();
    if (session) { return session.user_id; }
  }

  if (!config.auth.required) {
    const { getOrCreateSoloUserForAuth, } = await import("@/middleware/auth");
    const solo = await getOrCreateSoloUserForAuth(database, config.auth.demoUsername ?? "solo",);
    if (solo) { return solo.id; }
  }
  return null;
}

/**
 * Parse an imported actor file (JSON / PNG / YAML / TOML).
 *
 * @returns Parsed actor data + import spec, or null when the format is unsupported.
 */
async function parseImportFile(
  fileBytes: Buffer,
  filename: string,
  file: File,
): Promise<{ data: Record<string, unknown>; spec: string | undefined } | null> {
  const { jsonParseOr, } = await import("@/utils");
  const { load: yamlLoad, } = await import("js-yaml");
  const parseToml = Bun.TOML.parse;
  const { extractCharacterDataFromPng, } = await import("@/characters/steganography");

  if (filename.endsWith(".json",)) {
    const parsed = jsonParseOr<Record<string, unknown> | null>(await file.text(), null,);
    if (!parsed || typeof parsed !== "object") { return null; }
    return {
      data: parsed,
      spec: parsed.spec === "chara_card_v2" ? "chara_card_v2" : undefined,
    };
  }
  if (filename.endsWith(".png",)) {
    const extracted = extractCharacterDataFromPng(fileBytes,);
    if (!extracted) { return null; }
    return { data: extracted.data, spec: extracted.spec, };
  }
  if (filename.endsWith(".yaml",) || filename.endsWith(".yml",)) {
    const parsed = yamlLoad(await file.text(),);
    if (!parsed || typeof parsed !== "object") { return null; }
    return { data: parsed as Record<string, unknown>, spec: undefined, };
  }
  if (filename.endsWith(".toml",)) {
    const parsed = parseToml(await file.text(),);
    if (!parsed || typeof parsed !== "object") { return null; }
    return { data: parsed as Record<string, unknown>, spec: undefined, };
  }
  return null;
}

export interface TestServer {
  url: string;
  db: Kysely<DB>;
  config: Config;
  mockProvider: MockLLMProvider | null;
  context: { chatId: string };
  close: () => void;
}
/**
 * Factory that builds a Kysely `Dialect`. Defaults to in-memory SQLite;
 * override with a Postgres/MySQL factory (gated by `TEST_DB=postgres`) to
 * exercise the dialect-swap design. See `docs/meta/code-practices-improvements/05`.
 */
export type DialectFactory = () => Dialect;

function sqliteInMemory(): Dialect {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA journal_mode = WAL",);
  sqlite.run("PRAGMA foreign_keys = ON",);
  return createSqliteDialect(sqlite,);
}

/**
 * Create a test database using the supplied dialect factory.
 * @param dialectFactory Builder for the Kysely Dialect (defaults to in-memory SQLite).
 */
export function createTestDb(dialectFactory: DialectFactory = sqliteInMemory,): Kysely<DB> {
  const db = new Kysely<DB>({ dialect: dialectFactory(), },);

  // Override global DB so all getDatabase() calls resolve to test DB
  setTestDatabase(db,);

  return db;
}

/**
 * Run all migrations on a test database.
 */
export async function runMigrations(db: Kysely<DB>,): Promise<void> {
  await runAllMigrations(db as never,);
}

/**
 * E2E_SAFEGUARD: prevent accidental runs against real data.
 * When E2E_SAFEGUARD=1 (default), validates DB is :memory: and
 * upload dir is under /tmp/. Logs warnings for each check.
 * Set E2E_SAFEGUARD=0 to bypass.
 */
function enforceE2eSafeguard(config: Config,): void {
  const safeguard = process.env.E2E_SAFEGUARD ?? "1";
  if (safeguard === "0") {
    console.warn("[E2E_SAFEGUARD=0] Safety checks bypassed — ensure you are not pointed at real data",);
    return;
  }

  const issues: string[] = [];

  if (config.db.sqliteFilename !== ":memory:") {
    issues.push(`db.sqliteFilename is "${config.db.sqliteFilename}", expected ":memory:"`,);
  }

  if (!config.assets.uploadDir?.startsWith("/tmp/",)) {
    issues.push(`assets.uploadDir is "${config.assets.uploadDir}", expected under /tmp/`,);
  }

  if (config.auth.required) {
    issues.push("auth.required is true, expected false for isolated e2e",);
  }

  if (issues.length > 0) {
    const msg = [
      "[E2E_SAFEGUARD] Refusing to run: test config would touch real data.",
      ...issues.map((i,) => `  - ${i}`),
      "Set E2E_SAFEGUARD=0 to bypass (or use the in-memory test config from createTestServer).",
    ].join("\n",);
    throw new Error(msg,);
  }

  // Only log if env override detected (suppress noise in normal runs)
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
export function loadTestConfig(
  overrides?: Omit<Partial<Config>, "auth"> & { auth?: Partial<Config["auth"]> },
): Config {
  // Build from schema defaults, NOT loadConfig(): src test files register
  // process-global mock.module("../config/load") stubs (e.g. image-gen
  // partial configs) that persist for every later file, and e2e suites run
  // last. loadConfig() would return the stub; defaults + the explicit
  // overrides below are the entire e2e contract.
  const config = structuredClone(createConfigSchema().defaults,) as Config;
  // Apply safe defaults BEFORE safeguard check so real config
  // values (real DB path, real upload dir) don't trigger rejection.
  config.server.port = 0;
  config.db.sqliteFilename = ":memory:";
  config.assets.enabled = true;
  config.assets.maxFileSize = 10 * 1024 * 1024; // 10 MB
  config.assets.uploadDir = "/tmp/loop-lore-e2e-placeholder";
  config.auth.required = false;
  // JWT secret is required by all login handlers (demo-login, login, register).
  // Use a deterministic test secret so JWT verify works in authenticate().
  config.auth.jwtSecret ||= "e2e-test-jwt-secret";
  enforceE2eSafeguard(config,);

  if (overrides) {
    // Deep merge auth overrides
    if (overrides.auth) { Object.assign(config.auth, overrides.auth,); }
    // Deep merge server overrides
    if (overrides.server) { Object.assign(config.server, overrides.server,); }
    // Deep merge assets overrides
    if (overrides.assets) { Object.assign(config.assets, overrides.assets,); }
    // Deep merge ageGate overrides
    if (overrides.ageGate) { Object.assign(config.ageGate, overrides.ageGate,); }
    // Deep merge byoKey overrides
    if (overrides.byoKey) { Object.assign(config.byoKey, overrides.byoKey,); }
    // Deep merge encryption overrides
    if (overrides.encryption) { Object.assign(config.encryption, overrides.encryption,); }
    // Deep merge generation overrides (providers, models, defaultProvider)
    if (overrides.generation) { config.generation = mergeGeneration(config.generation, overrides.generation,); }
    // Deep merge testing overrides
    if (overrides.testing) { config.testing = { ...config.testing, ...overrides.testing, }; }
  }

  return config;
}

/**
 * Deep-merge generation config overrides.
 * Recursively merges providers and defaultModels instead of replacing.
 */
function mergeGeneration(base: Config["generation"], overrides: Partial<Config["generation"]>,): Config["generation"] {
  const result = { ...base, };
  if (overrides.providers) {
    result.providers = { ...base.providers, };
    for (const [key, val,] of Object.entries(overrides.providers,)) {
      if (Array.isArray(val,)) {
        // openaiCompatible is an array — deep merge
        result.providers[key as keyof typeof result.providers] = val as never;
      } else if (val && typeof val === "object") {
        result.providers[key as keyof typeof result.providers] = {
          ...((base.providers as unknown as Record<string, unknown>)[key] as Record<string, unknown>),
          ...(val as Record<string, unknown>),
        } as never;
      }
    }
  }
  if (overrides.defaultProvider != null) { result.defaultProvider = overrides.defaultProvider; }
  if (overrides.defaultModels) { result.defaultModels = { ...base.defaultModels, ...overrides.defaultModels, }; }
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
  overrides?: Omit<Partial<Config>, "auth"> & { auth?: Partial<Config["auth"]> },
  registerMock = false,
): Promise<TestServer> {
  const db = createTestDb();
  await runMigrations(db,);

  // Seed built-in chat setup templates — location creation auto-binds a
  // public chat to a template (production start.ts does this too).
  const { seedChatSetupTemplates, } = await import("@/chat/service");
  await seedChatSetupTemplates(db,);

  const config = loadTestConfig(overrides,);

  // Create temp upload dir under /tmp/ — NEVER in project dir or user home
  const testRunId = `loop-lore-e2e-${Date.now()}-${Math.random().toString(36,).slice(2, 8,)}`;
  const testUploadDir = resolve("/tmp", testRunId, "uploads",);
  config.assets.uploadDir = testUploadDir;
  mkdirSync(testUploadDir, { recursive: true, },);

  // Initialize logger + age gate (singletons)
  const logger = createLogger({ level: "error", },);
  setGlobalLogger(logger,);
  initAgeGate(config.ageGate,);
  // Reset SMK from any prior unit tests — test config has no encryption key
  await initSmk(config.encryption,);

  // Initialize providers from config (real or mock)
  let mockProvider: MockLLMProvider | null = null;
  if (registerMock) {
    mockProvider = new MockLLMProvider();
    registerProvider("mock-provider", mockProvider,);
    // Use the actual instance from registry (may be pre-existing from other tests)
    mockProvider = getProvider("mock-provider",) as MockLLMProvider ?? mockProvider;
    // Force mock as the default provider/model. config.yaml may set a real
    // defaultProvider (e.g. a local llama-swap endpoint); if we only set it
    // when unset, generation e2e tests hit the real LLM (slow timeouts +
    // content mismatch). registerMock is used exclusively by generation e2e,
    // so this never affects other suites.
    config.generation.defaultProvider = "mock-provider";
    config.generation.defaultModels["mock-provider"] = "mock-model";
    // Clear real providers from config so initializeProviders only registers the mock
    config.generation.providers.openaiCompatible = [];
  }
  initializeProviders(config,);

  const app = createApp({
    database: db,
    config,
    handleNonApiRequest: async () => new Response("Not found", { status: 404, },),
  },);

  // Route through the same production handler so response-header and
  // dynamic-response policies are exercised by e2e tests.
  const handler = createRequestHandler(app, config, logger,);

  const bunServer = Bun.serve({ port: 0, fetch: handler, },);
  // Use 127.0.0.1 instead of localhost to avoid lean-ctx proxy interception
  // Also bypass HTTP_PROXY for test-local fetch calls
  const url = `http://127.0.0.1:${bunServer.port}`;
  process.env.NO_PROXY = process.env.NO_PROXY
    ? `${process.env.NO_PROXY},127.0.0.1,localhost`
    : "127.0.0.1,localhost";
  const SEED_DEFAULT_CHAT_ID = "a0000004-0000-4000-a000-000000000000";

  return {
    url,
    db,
    config,
    mockProvider,
    context: { chatId: SEED_DEFAULT_CHAT_ID, },
    close: () => {
      bunServer.stop();
      setTestDatabase(null,);
      resetSoloUserCache();
      resetLoginRateLimiter();
      const testDir = resolve("/tmp", testRunId,);
      if (existsSync(testDir,)) {
        rmSync(testDir, { recursive: true, force: true, },);
      }
    },
  };
}
