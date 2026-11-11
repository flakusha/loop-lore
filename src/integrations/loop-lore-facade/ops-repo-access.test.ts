// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ops-repo-access.test.ts — the RSI repo-access tier ops through runFacadeOp.
//
// Covers the tier's acceptance surfaces on a REAL registry:
//  - the tier is INERT while disabled (the default): repo_access_disabled;
//  - kind admission in authz: users + integration-token external agents are
//    refused with a typed 403 BEFORE any handler/gate runs;
//  - internal-service + enabled: repo.context returns the gate root, and
//    repo.check requires (and with defaults holds) the check:run capability,
//    running the INJECTED runner — never a real subprocess;
//  - the manifest exposes the repo-access descriptors.
//
// Resource contract (parallel-safe): one :memory: SQLite per file via
// createTestDb, a fake runner (no subprocess), the settings singleton reset
// per test, per-test user ids (fresh rate-budget buckets); no ports/env/sleeps.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtemp, rm, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createRequestContext, } from "../../middleware/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { setRepoScopeRootDetectorForTests, } from "../harness/repo-access/principal-scope";
import {
  initRepoAccessSettings,
  resetRepoAccessSettings,
} from "../harness/repo-access/settings";
import { registerRepoAccessOps, type RepoCheckRunner, } from "./ops/repo-access";
import { createFacadeRegistry, runFacadeOp, } from "./registry";
import { facadeContextFromRequestContext, } from "./types";

let testDb: TestDb;
let db: Kysely<DB>;
let config: Config;
let repoRoot: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
  config = {} as Config;
},);

beforeEach(async () => {
  resetRepoAccessSettings();
  repoRoot = await mkdtemp(join(tmpdir(), "rsi-facade-",),);
  setRepoScopeRootDetectorForTests(() => repoRoot);
},);

afterEach(async () => {
  setRepoScopeRootDetectorForTests(null,);
  resetRepoAccessSettings();
  await rm(repoRoot, { recursive: true, force: true, },);
},);

afterAll(async () => {
  await destroyTestDb(testDb,);
},);

/** A fake check runner — records the root it was called with. */
function fakeRunner(calls: string[], ok = true,): RepoCheckRunner {
  return async (root,) => {
    calls.push(root,);
    return { ok, output: ok ? "check ok" : "check failed", };
  };
}

function buildRegistry(runner?: RepoCheckRunner,): ReturnType<typeof createFacadeRegistry> {
  const registry = createFacadeRegistry();
  registerRepoAccessOps(registry, { database: db, config, }, runner,);
  return registry;
}

function ctxFor(
  kind: "user" | "internal-service" | "external-agent",
  userId: string,
): ReturnType<typeof facadeContextFromRequestContext> {
  const rc = createRequestContext({
    userId,
    userRole: "admin",
    sessionId: null,
    principalKind: kind,
  },);

  return facadeContextFromRequestContext({ ...rc, requestId: `req-${userId}`, }, db, config,);
}

describe("facade repo-access ops — the RSI tier", () => {
  test("the tier is inert while disabled (default): repo_access_disabled 403", async () => {
    // No init call — the unseeded store reads disabled.
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor("internal-service", "svc-off",), "repo.context", {},);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
    expect((result.json as { code?: string }).code,).toBe("repo_access_disabled",);
  });

  test("a user principal is refused in authz before the gate (typed 403)", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor("user", "user-ra",), "repo.context", {},);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
    expect((result.json as { error?: string }).error,).toBe("forbidden",);
  });

  test("an integration-token external agent is refused even with the top tier", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const registry = buildRegistry();
    const ctx = ctxFor("external-agent", "token-ra",);
    // A maximal token: chat-write (the ladder's top) still never admits.
    const principal = { ...ctx.principal, credentialScope: "chat-write" as const, };
    const result = await runFacadeOp(registry, { ...ctx, principal, }, "repo.context", {},);
    expect(result.ok,).toBe(false,);
    expect(result.status,).toBe(403,);
    expect((result.json as { error?: string }).error,).toBe("forbidden",);
  });

  test("internal-service + enabled: repo.context returns the gate-resolved root", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const registry = buildRegistry();
    const result = await runFacadeOp(registry, ctxFor("internal-service", "svc-ctx",), "repo.context", {},);
    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
    expect((result.json as { root?: string }).root,).toBe(repoRoot,);
  });

  test("repo.check runs the injected runner in the repo root (check:run held by default)", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const calls: string[] = [];
    const registry = buildRegistry(fakeRunner(calls,),);
    const result = await runFacadeOp(registry, ctxFor("internal-service", "svc-check",), "repo.check", {},);
    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
    expect(calls,).toEqual([repoRoot,],);
    expect((result.json as { ok?: boolean }).ok,).toBe(true,);
  });

  test("repo.check reports the check's own failure without failing the op", async () => {
    initRepoAccessSettings({ enabled: true, },);
    const registry = buildRegistry(fakeRunner([], false,),);
    const result = await runFacadeOp(registry, ctxFor("internal-service", "svc-fail",), "repo.check", {},);
    expect(result.ok,).toBe(true,);
    expect(result.status,).toBe(200,);
    expect((result.json as { ok?: boolean }).ok,).toBe(false,);
  });

  test("the manifest exposes the repo-access descriptors", () => {
    const manifest = buildRegistry().manifest();
    const repo = manifest.filter((m,) => m.domain === "repo-access");
    expect(repo.map((m,) => m.name).sort(),).toEqual(["repo.check", "repo.context",],);
    for (const m of repo) {
      expect(m.scope,).toBe("read",);
    }
  });
});
