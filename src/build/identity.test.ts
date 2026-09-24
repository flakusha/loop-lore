// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for build-identity hash + endpoints.
 *
 * Covers (per TASK-build-identity-hash-for-tamper-detection):
 *   - deterministic hash for identical inputs
 *   - source-edit changes the hash
 *   - lockfile-edit changes the hash
 *   - git-missing falls back to empty gitHead layer
 *   - cache returns the same object until reset
 *   - public endpoint exposes buildHash/gitHead/builtAt, no secrets
 *   - admin endpoint gated on admin.system capability
 *   - instance-state includes truncated buildHash
 *
 * Heavy test note: hashing the full repo on each run costs ~1-2s of fs
 * traversal; tests run isolated via --isolate to keep state clean. Each
 * test uses a fresh mkdtemp project root so file content is fully
 * deterministic.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  __resetBuildIdentityForTests,
  type BuildIdentity,
  computeBuildIdentity,
} from "../build/identity";
import { APP_NAME, APP_VERSION, } from "../config/constants";
import type { Config, } from "../config/schema";
import { createLogger, } from "../logger";
import { buildIdRoutes, } from "../routes/build-id";
import { federationRoutes, } from "../routes/federation";
import { createTestDb, } from "../test-utils/create-test-db";

// requirePermission calls getLogger() on denial — initialize the global
// logger once so audit-log entries emitted by permission denials don't throw.
// Logger level: error suppresses the audit info line from test output.
let tempDir = "";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "loop-lore-build-id-test-",),);
  __resetBuildIdentityForTests();
},);

afterEach(() => {
  __resetBuildIdentityForTests();
  if (tempDir && existsSync(tempDir,)) {
    rmSync(tempDir, { recursive: true, force: true, },);
  }
},);

/** Lay down a deterministic project: 1 source file + 3 lockfile-shaped files. */
function seedProject(): void {
  mkdirSync(join(tempDir, "src",), { recursive: true, },);
  writeFileSync(join(tempDir, "src", "index.ts",), "export const x = 1;\n",);
  writeFileSync(join(tempDir, "package.json",), JSON.stringify({ name: "loop-lore", version: "0.1.0", },) + "\n",);
  writeFileSync(join(tempDir, "bun.lock",), "lockfile-v1\n",);
  writeFileSync(join(tempDir, "bunfig.toml",), "[run]\nalways = true\n",);
}

describe("computeBuildIdentity — determinism", () => {
  test("returns same hash across two calls on identical inputs", async () => {
    seedProject();
    const a = await computeBuildIdentity({ projectRoot: tempDir, },);
    const b = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(a.buildHash,).toBe(b.buildHash,);
    expect(a.sourceTreeHash,).toBe(b.sourceTreeHash,);
    expect(a.lockfileHash,).toBe(b.lockfileHash,);
  });

  test("buildHash is sha256 hex (64 chars) and buildHashShort is 16", async () => {
    seedProject();
    const id = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(id.buildHash,).toMatch(/^[0-9a-f]{64}$/,);
    expect(id.buildHashShort,).toBe(id.buildHash.slice(0, 16,),);
  });

  test("memoizes per projectRoot until reset", async () => {
    seedProject();
    const a = await computeBuildIdentity({ projectRoot: tempDir, },);
    const same = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(same,).toBe(a,);
    __resetBuildIdentityForTests();
    const fresh = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(fresh,).not.toBe(a,);
    expect(fresh.buildHash,).toBe(a.buildHash,);
  });
});

describe("computeBuildIdentity — sensitivity", () => {
  test("source-file edit changes buildHash", async () => {
    seedProject();
    const before = await computeBuildIdentity({ projectRoot: tempDir, },);
    writeFileSync(join(tempDir, "src", "index.ts",), "export const x = 2;\n",);
    __resetBuildIdentityForTests();
    const after = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(after.buildHash,).not.toBe(before.buildHash,);
    expect(after.sourceTreeHash,).not.toBe(before.sourceTreeHash,);
  });

  test("lockfile edit changes buildHash", async () => {
    seedProject();
    const before = await computeBuildIdentity({ projectRoot: tempDir, },);
    writeFileSync(join(tempDir, "bun.lock",), "lockfile-v2\n",);
    __resetBuildIdentityForTests();
    const after = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(after.buildHash,).not.toBe(before.buildHash,);
    expect(after.lockfileHash,).not.toBe(before.lockfileHash,);
  });

  test("new source file changes buildHash", async () => {
    seedProject();
    const before = await computeBuildIdentity({ projectRoot: tempDir, },);
    writeFileSync(join(tempDir, "src", "extra.ts",), "export const y = 1;\n",);
    __resetBuildIdentityForTests();
    const after = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(after.buildHash,).not.toBe(before.buildHash,);
  });

  test("manifest carries APP_NAME + APP_VERSION", async () => {
    seedProject();
    const id = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(id.manifest.appVersion,).toBe(APP_VERSION,);
    expect(id.manifest.appName,).toBe(APP_NAME,);
  });
});

describe("computeBuildIdentity — git layer", () => {
  test("git-missing falls back to empty gitHead (no throw)", async () => {
    seedProject();
    // tempDir is not a git repo, so gitHead should be ""
    const id = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(id.gitHead,).toBe("",);
    expect(typeof id.buildHash,).toBe("string",);
    expect(id.buildHash.length,).toBe(64,);
  });
});

describe("computeBuildIdentity — exclusion", () => {
  test("node_modules and .tmp content is ignored", async () => {
    seedProject();
    const before = await computeBuildIdentity({ projectRoot: tempDir, },);
    mkdirSync(join(tempDir, "node_modules", "x",), { recursive: true, },);
    mkdirSync(join(tempDir, ".tmp",), { recursive: true, },);
    writeFileSync(join(tempDir, "node_modules", "x", "junk.js",), "junk",);
    writeFileSync(join(tempDir, ".tmp", "junk.txt",), "junk",);
    __resetBuildIdentityForTests();
    const after = await computeBuildIdentity({ projectRoot: tempDir, },);
    expect(after.sourceTreeHash,).toBe(before.sourceTreeHash,);
    expect(after.buildHash,).toBe(before.buildHash,);
  });
});

describe("buildIdRoutes — public endpoint", () => {
  test("GET /.well-known/loop-lore/build-id returns buildHash/gitHead/builtAt", async () => {
    seedProject();
    const app = new Elysia().use(buildIdRoutes({ projectRoot: tempDir, },),);
    const res = await app.handle(
      new Request("http://localhost/.well-known/loop-lore/build-id",),
    );
    expect(res.status,).toBe(200,);
    const text = await res.text();
    expect(text,).toMatch(/"buildHash":"[0-9a-f]{64}"/,);
    expect(text,).toMatch(/"buildHashShort":"[0-9a-f]{16}"/,);
    expect(text,).toMatch(/"gitHead":/,);
    expect(text,).toMatch(/"builtAt":/,);
    // no secret paths leaked
    expect(text,).not.toMatch(/sourceTreeHash|lockfileHash|manifestHash/i,);
  });
});

describe("buildIdRoutes — admin endpoint", () => {
  test("GET /api/admin/build-id returns 401/403 without auth context", async () => {
    seedProject();
    // No derive shim — requireUserId sees no userId and returns 401.
    const app = new Elysia().use(buildIdRoutes({ projectRoot: tempDir, },),);
    const res = await app.handle(new Request("http://localhost/api/admin/build-id",),);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
  });

  test("GET /api/admin/build-id returns full breakdown for admin user", async () => {
    seedProject();
    const app = new Elysia()
      .derive(() => ({ userId: "test-admin", userRole: "admin", }))
      .use(buildIdRoutes({ projectRoot: tempDir, },),);
    const res = await app.handle(new Request("http://localhost/api/admin/build-id",),);
    expect(res.status,).toBe(200,);
    const text = await res.text();
    expect(text,).toMatch(/"sourceTreeHash":/,);
    expect(text,).toMatch(/"lockfileHash":/,);
    expect(text,).toMatch(/"manifestHash":/,);
    expect(text,).toMatch(/"manifest":/,);
  });

  test("GET /api/admin/build-id rejects non-admin authenticated user", async () => {
    seedProject();
    const app = new Elysia()
      .derive(() => ({ userId: "test-user", userRole: "user", }))
      .use(buildIdRoutes({ projectRoot: tempDir, },),);
    const res = await app.handle(new Request("http://localhost/api/admin/build-id",),);
    expect(res.status,).toBe(403,);
  });
});

// Federation instance-state must now include truncated buildHash.
function federationConfig(): Config {
  return {
    server: { host: "localhost", port: 3000, tls: undefined, },
    auth: { registrationOpen: false, },
    federation: {
      enabled: true,
      seeds: [],
      peers: [],
      meshPsk: "",
      duplication: { mode: "trusted", peers: [], },
    },
  } as unknown as Config;
}

describe("federationRoutes — instance-state carries buildHash", () => {
  test("/api/instance-state includes truncated buildHash (16 hex chars)", async () => {
    const db = (await createTestDb()).db;
    const app = federationRoutes({ config: federationConfig(), database: db, },);
    const res = await app.handle(new Request("http://localhost/api/instance-state",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.buildHash,).toBe("string",);
    expect(body.buildHash,).toMatch(/^[0-9a-f]{16}$/,);
    // sanity: a fresh compute against the same default cwd returns the same short hash
    const id: BuildIdentity = await computeBuildIdentity({ force: true, },);
    expect(body.buildHash,).toBe(id.buildHashShort,);
  });
});
