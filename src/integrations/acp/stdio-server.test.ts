// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-server.test.ts — the inbound ACP studio server's stdio transport
 * (§3.3): the admission gate through connectInboundAcpServer (real handler
 * graph over an in-memory database, write seam = in-memory array), and the
 * production main() entrypoint mocked at its module seams (logger, config
 * loader, node:readline) — asserted to wire the NDJSON loop to the process
 * streams without ever spawning a live stdio server.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per file (the
 * getDatabase() override is set per test and cleared in afterEach/teardown),
 * facade-registry singleton reset per test, no ports/env, no fixed paths.
 * The main() suite owns the process seams it touches: logger/config/readline
 * module mocks exist only under ISOLATED (per-file module registry), the
 * stdout writer is swapped only inside the admitted-boot test, and
 * process.exitCode is restored to its entry value (?? 0) in a finally —
 * every teardown lives in afterEach/finally so a failed test cannot poison
 * siblings.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { initInboundSettings, resetInboundSettings, } from "../inbound/settings";
import { resetFacadeRegistry, } from "../loop-lore-facade/instance";
import { ACP_ERRORS, ACP_PROTOCOL_VERSION, } from "./agent-server";
import { connectInboundAcpServer, main, } from "./stdio-server";

// ── main()'s module seams (ISOLATED-only: mock.module pins the process) ─────

const logCalls: { level: string; message: string }[] = [];
const fakeLogger = new Proxy({}, {
  get: (_target: unknown, level: string | symbol,) => (...args: unknown[]) => {
    logCalls.push({ level: String(level,), message: typeof args[0] === "string" ? args[0] : "", },);
    // Chainable (getLogger().child(...) in migrate.ts et al).
    return fakeLogger;
  },
},);

let mainConfig: Config | null = null;
const rlCalls: Array<Record<string, unknown>> = [];
let rlLines: string[] = [];

if (ISOLATED) {
  mock.module("../../logger", () => ({
    createLogger: () => fakeLogger,
    getLogger: () => fakeLogger,
    setGlobalLogger: () => {},
    getChildLogger: () => null,
    LoggerImpl: class {},
  }),);

  mock.module("../../config/load", () => ({
    loadConfig: () => {
      if (mainConfig === null) { throw new Error("stdio-server.test: mainConfig not seeded",); }
      return mainConfig;
    },
    validateConfig: () => {},
    applyProviderEnvVars: () => {},
    coerceValue: (...args: unknown[]) => args[0],
    deepMerge: (...args: unknown[]) => args[0],
    setByPath: (...args: unknown[]) => args[0],
    MIN_PII_SECRET_LENGTH: 8,
    validatePiiSafety: () => true,
    DEFAULT_CONFIG_FILES: [],
    ENV_MAP: {},
    LOCAL_CONFIG_FILES: [],
  }),);

  // The stdio loop seam: main() builds its readline interface over
  // process.stdin; the fake records the wiring and yields the canned lines.
  mock.module("node:readline", () => ({
    createInterface: (opts: Record<string, unknown>,) => {
      rlCalls.push(opts,);
      return {
        async *[Symbol.asyncIterator]() {
          for (const line of rlLines) { yield line; }
        },
      };
    },
  }),);
}

const USER = "acp-stdio-user";

let testDb: TestDb;
let db: Kysely<DB>;
let baseConfig: Config;

/** A config copy with one inbound override applied. */
function configWith(inbound: Partial<Config["integrations"]["inbound"]>,): Config {
  return {
    ...baseConfig,
    integrations: {
      ...baseConfig.integrations,
      inbound: { ...baseConfig.integrations.inbound, ...inbound, },
    },
  };
}

/** connect with an in-memory write seam; returns the raw NDJSON strings. */
function makeServer(cfg: Config,) {
  resetFacadeRegistry();
  const out: string[] = [];
  const handler = connectInboundAcpServer(
    { database: db, config: cfg, },
    (message,) => {
      out.push(message as string,);
    },
  );

  return { out, handler, };
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  baseConfig = createConfigSchema().defaults as unknown as Config;
},);

afterAll(async () => {
  resetFacadeRegistry();
  resetInboundSettings();
  await destroyTestDb(testDb,);
},);

describe("connectInboundAcpServer — the admission gate + handler wiring", () => {
  afterEach(() => {
    resetInboundSettings();
    resetFacadeRegistry();
  },);

  test("the deny-by-default gate refuses unseeded / disabled / principal-less", () => {
    // Unseeded store.
    resetFacadeRegistry();
    expect(connectInboundAcpServer({ database: db, config: baseConfig, }, () => {},),).toBeNull();

    // Seeded but disabled (schema defaults).
    initInboundSettings({ mcpEnabled: false, acpEnabled: false, principalUserId: "", principalScope: "read", },);
    resetFacadeRegistry();
    expect(connectInboundAcpServer({ database: db, config: baseConfig, }, () => {},),).toBeNull();

    // Enabled but no principal.
    initInboundSettings({ mcpEnabled: false, acpEnabled: true, principalUserId: "", principalScope: "read", },);
    resetFacadeRegistry();
    expect(connectInboundAcpServer({ database: db, config: baseConfig, }, () => {},),).toBeNull();
  });

  test("an admitted connection returns the real line handler over the write seam", async () => {
    initInboundSettings({ mcpEnabled: false, acpEnabled: true, principalUserId: USER, principalScope: "read", },);
    const { out, handler, } = makeServer(
      configWith({ acpEnabled: true, principalUserId: USER, principalScope: "read", },),
    );

    expect(typeof handler,).toBe("function",);

    // The REAL agent handler: initialize answers protocolVersion 1 —
    // pre-serialized NDJSON through the write seam (the stdio contract).
    await handler!(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {}, },),);

    expect(out,).toHaveLength(1,);
    expect(typeof out[0],).toBe("string",);
    const reply = JSON.parse(out[0]!,) as { result?: { protocolVersion?: number; agentInfo?: { name?: string } } };
    expect(reply.result?.protocolVersion,).toBe(ACP_PROTOCOL_VERSION,);
    expect(reply.result?.agentInfo?.name,).toBe("loop-lore",);

    // An unparseable line comes back as the parse error through the seam.
    await handler!("{this is not json",);
    expect(out,).toHaveLength(2,);
    const parseErr = JSON.parse(out[1]!,) as { error?: { code?: number } };
    expect(parseErr.error?.code,).toBe(ACP_ERRORS.parse,);
  });
});

describeOrSkip("inbound ACP stdio server main()", () => {
  beforeEach(() => {
    resetFacadeRegistry();
    resetInboundSettings();
    logCalls.length = 0;
    rlCalls.length = 0;
    rlLines = [];
    // main() resolves its own config + database; point those seams at the
    // file's fixture (destroyTestDb clears the db override).
    mainConfig = baseConfig;
    setTestDatabase(db, testDb.sqlite,);
  },);

  afterEach(() => {
    setTestDatabase(null,);
    resetInboundSettings();
    mainConfig = null;
  },);

  test("the deny-by-default gate refuses the boot: stdin is never wired", async () => {
    const prevExitCode = process.exitCode ?? 0;
    let exitCodeAfter: string | number | undefined;
    try {
      await main();
      exitCodeAfter = process.exitCode;
    } finally {
      process.exitCode = prevExitCode;
    }

    expect(exitCodeAfter,).toBe(1,);
    expect(logCalls.some((call,) => call.level === "warn" && call.message.includes("refused to start",)),).toBe(true,);
    expect(rlCalls,).toHaveLength(0,);
  });

  test("an admitted boot wires the handler to the stdin/stdout NDJSON loop", async () => {
    initInboundSettings({ mcpEnabled: false, acpEnabled: true, principalUserId: USER, principalScope: "read", },);
    mainConfig = configWith({ acpEnabled: true, principalUserId: USER, principalScope: "read", },);
    rlLines = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {}, },),
      "{this is not json",
    ];

    const writes: unknown[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: unknown,): boolean => {
      writes.push(chunk,);
      return true;
    }) as typeof process.stdout.write;

    const prevExitCode = process.exitCode ?? 0;
    let exitCodeAfter: string | number | undefined;
    try {
      await main();
      exitCodeAfter = process.exitCode;
    } finally {
      process.stdout.write = originalWrite;
      process.exitCode = prevExitCode;
      mainConfig = null;
    }

    // The loop was wired to the process streams.
    expect(rlCalls,).toHaveLength(1,);
    expect(rlCalls[0]?.input,).toBe(process.stdin,);
    expect(rlCalls[0]?.crlfDelay,).toBe(Infinity,);

    // Each fed line came back through the stdout writer as NDJSON.
    expect(writes,).toHaveLength(2,);
    const reply = JSON.parse(String(writes[0],).trim(),) as { result?: { protocolVersion?: number } };
    expect(reply.result?.protocolVersion,).toBe(ACP_PROTOCOL_VERSION,);
    const parseErr = JSON.parse(String(writes[1],).trim(),) as { error?: { code?: number } };
    expect(parseErr.error?.code,).toBe(ACP_ERRORS.parse,);

    expect(logCalls.some((call,) => call.level === "info" && call.message.includes("closed",)),).toBe(true,);
    expect(exitCodeAfter,).toBe(prevExitCode,);
  });
},);
