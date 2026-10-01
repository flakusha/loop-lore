// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/init-asset-compression.test.ts — Boot-time asset pipeline:
// auto-build of the frontend bundle, copy of src/public + src/views into
// dist/public, pre-compression, and content-hash injection. The source
// resolves every path from its own location (src/server/), so the tests
// redirect those roots to temp fixtures via a node:fs mock and stub the
// build/compress/hash-injection boundaries.

import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Logger, } from "../logger/types";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

// Paths the source resolves from src/server/.
const DIST_PUBLIC = join(import.meta.dir, "..", "..", "dist", "public",);
const SRC_PUBLIC = join(import.meta.dir, "..", "..", "src", "public",);
const SRC_VIEWS = join(import.meta.dir, "..", "..", "src", "views",);
const DOCS = join(import.meta.dir, "..", "..", "docs", ".vitepress", "dist",);

interface Fixtures {
  distPublic: string;
  srcPublic: string;
  srcViews: string;
  docs: string;
}

function getFixtures(): Fixtures {
  const fx = (globalThis as { __iapFixtures?: Fixtures }).__iapFixtures;
  if (!fx) { throw new Error("fixtures not initialized — suite must run under --isolate",); }
  return fx;
}

// Call logs captured by the module mocks below; reset per test.
const spawnSyncCalls: unknown[][] = [];
const copyDirectoryCalls: [string, string,][] = [];
const compressAssetsCalls: [string, string,][] = [];
const injectContentHashesCalls: string[] = [];

if (ISOLATED) {
  mock.module("node:fs", () => {
    const actual = require("node:fs",);
    const fx: Fixtures = {
      distPublic: mkdtempSync(join(tmpdir(), "ll-iap-dist-",),),
      // Source-dir fixtures are NOT created — existsSync() on them returns
      // false until a test writes a file (which creates the dir).
      srcPublic: join(tmpdir(), `ll-iap-pub-${Math.random().toString(36,).slice(2, 10,)}`,),
      srcViews: join(tmpdir(), `ll-iap-views-${Math.random().toString(36,).slice(2, 10,)}`,),
      docs: join(tmpdir(), `ll-iap-docs-${Math.random().toString(36,).slice(2, 10,)}`,),
    };
    (globalThis as { __iapFixtures?: Fixtures }).__iapFixtures = fx;
    const redirect = (p: unknown,): string => {
      const s = String(p,);
      const map = [[DIST_PUBLIC, fx.distPublic,], [SRC_PUBLIC, fx.srcPublic,], [SRC_VIEWS, fx.srcViews,], [
        DOCS,
        fx.docs,
      ],] as const;
      for (const [real, fixture,] of map) {
        if (s === real || s.startsWith(`${real}/`,)) { return fixture + s.slice(real.length,); }
      }
      return s;
    };
    return {
      ...actual,
      existsSync: (p: unknown,) => actual.existsSync(redirect(p,),),
      statSync: (p: unknown,) => actual.statSync(redirect(p,),),
      readdirSync: (p: unknown, ...args: unknown[]) => actual.readdirSync(redirect(p,), ...args,),
    };
  },);

  mock.module("node:child_process", () => ({
    spawnSync: (...args: unknown[]) => {
      spawnSyncCalls.push(args,);
      return { status: 0, };
    },
  }),);

  mock.module("../content/compress", () => ({
    compressAssets: async (src: string, dest: string,) => {
      compressAssetsCalls.push([src, dest,],);
      return { total: 0, originalBytes: 0, compressedBytes: { gz: 0, zst: 0, br: 0, }, };
    },
    copyDirectory: (src: string, dest: string,) => {
      copyDirectoryCalls.push([src, dest,],);
    },
  }),);

  mock.module("../content/hash-injection", () => ({
    injectContentHashes: (dir: string,) => {
      injectContentHashesCalls.push(dir,);
      return { replaced: 0, skipped: 0, };
    },
  }),);
}

const { initAssetCompression, } = await import("./init-asset-compression");

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

function resetFixtures(): void {
  const fx = getFixtures();
  // Only distPublic is a real fixture dir; the source-dir paths are left
  // non-existent so existsSync() returns false until a test creates them.
  rmSync(fx.distPublic, { recursive: true, force: true, },);
  mkdirSync(fx.distPublic, { recursive: true, },);
  for (const dir of [fx.srcPublic, fx.srcViews, fx.docs,]) {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

beforeEach(() => {
  resetFixtures();
  spawnSyncCalls.length = 0;
  copyDirectoryCalls.length = 0;
  compressAssetsCalls.length = 0;
  injectContentHashesCalls.length = 0;
},);

afterEach(() => {
  const fx = getFixtures();
  for (const dir of [fx.distPublic, fx.srcPublic, fx.srcViews, fx.docs,]) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

function writeFixture(root: string, rel: string, content: string,): void {
  const full = join(root, rel,);
  mkdirSync(join(full, "..",), { recursive: true, },);
  writeFileSync(full, content,);
}

// ── Tests ────────────────────────────────────────────────────

describeOrSkip("initAssetCompression", () => {
  test("auto-builds the frontend bundle when app.js is missing", async () => {
    const { logger, calls, } = makeLogger();
    await initAssetCompression(logger,);
    expect(spawnSyncCalls,).toHaveLength(1,);
    expect(spawnSyncCalls[0]?.[0],).toBe("bun",);
    expect(spawnSyncCalls[0]?.[1],).toEqual(["run", "build:frontend",],);
    expect(calls.some((c,) => JSON.stringify(c.message,).includes("Frontend build complete",)),).toBe(true,);
  });

  test("skips the auto-build when app.js already exists", async () => {
    const fx = getFixtures();
    writeFixture(fx.distPublic, "app.js", "bundle",);
    const { logger, calls, } = makeLogger();
    await initAssetCompression(logger,);
    expect(spawnSyncCalls,).toHaveLength(0,);
    expect(calls.some((c,) => JSON.stringify(c.message,).includes("Frontend JS not built",)),).toBe(false,);
  });

  test("copies source directories into the destination", async () => {
    const fx = getFixtures();
    writeFixture(fx.distPublic, "app.js", "bundle",);
    writeFixture(fx.srcPublic, "style.css", "body{}",);
    const { logger, } = makeLogger();
    await initAssetCompression(logger,);
    expect(copyDirectoryCalls.some(([src, dest,],) => src === SRC_PUBLIC && dest === DIST_PUBLIC),).toBe(true,);
  });

  test("compresses assets when source files are present", async () => {
    const fx = getFixtures();
    writeFixture(fx.distPublic, "app.js", "bundle",);
    writeFixture(fx.srcPublic, "style.css", "body{}",);
    const { logger, } = makeLogger();
    await initAssetCompression(logger,);
    expect(compressAssetsCalls.some(([src, dest,],) => src === SRC_PUBLIC && dest === DIST_PUBLIC),).toBe(true,);
  });

  test("runs hash injection over the destination directory", async () => {
    const fx = getFixtures();
    writeFixture(fx.distPublic, "app.js", "bundle",);
    const { logger, } = makeLogger();
    await initAssetCompression(logger,);
    expect(injectContentHashesCalls,).toContain(DIST_PUBLIC,);
  });

  test("does nothing when no source directories exist", async () => {
    const fx = getFixtures();
    writeFixture(fx.distPublic, "app.js", "bundle",);
    const { logger, } = makeLogger();
    await initAssetCompression(logger,);
    expect(copyDirectoryCalls,).toHaveLength(0,);
    expect(compressAssetsCalls,).toHaveLength(0,);
  });
},);
