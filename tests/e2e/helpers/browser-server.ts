// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E Test Server
 *
 * Extends the backend test server with full frontend serving (static files,
 * view templates, htmx endpoints). Uses the Elysia app for routing.
 * Provides Playwright browser fixture.
 *
 * Usage:
 *   const ctx = await createBrowserTest();
 *   const page = await ctx.browser.newPage();
 *   await page.goto(ctx.url + "/views/chat");
 *   await ctx.close();
 */
import "./logger-init";
import { initAgeGate, } from "@/age-gate/controller";
import type { Config, } from "@/config/schema";
import { initSmk, } from "@/crypto";
import { setTestDatabase, } from "@/db/index";
import type { DB, } from "@/db/schema";
import { createApp, } from "@/elysia-app";
import { initializeProviders, } from "@/generation";
import { createLogger, setGlobalLogger, } from "@/logger";
import { resetSoloUserCache, } from "@/middleware/index";
import { loadAllPlugins, unloadAllPlugins, } from "@/plugins";
import { handleApiRequest, } from "@/server";
import { type Browser, chromium, type Page, } from "@playwright/test";
import type { Kysely, } from "kysely";
import { spawnSync, } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { seedSolo, } from "./seed";
import { createTestDb, loadTestConfig, runMigrations, } from "./server";

// ── Types ────────────────────────────────────────────────────

export interface BrowserTestContext {
  url: string;
  db: Kysely<DB>;
  config: Config;
  browser: Browser;
  /** Open a page and track it so a test failure can't leak it into the next test. */
  openPage: () => Promise<Page>;
  /** Close every page still open (call in afterEach/finally to prevent failure cascade). */
  closeAllPages: () => Promise<void>;
  close: () => Promise<void>;
}

// ── Build frontend JS/CSS first ──────────────────────────────

// Source-tree fingerprint: rebuild dist/public whenever any frontend input
// changes (BUG-browser-harness-stale-frontend-build). Size+mtime inputs keep
// the check cheap while staying exact across rebases and worktree reuse.
function hashFrontendSources(root: string,): string {
  const hash = new Bun.CryptoHasher("sha256");
  const inputs = ["src/frontend", "src/views", "src/public"];
  for (const rel of inputs) {
    const dir = join(root, rel);
    if (!existsSync(dir)) { continue; }
    const files = [...new Bun.Glob("**/*").scanSync({ cwd: dir, dot: false })].sort();
    for (const entry of files) {
      const file = join(dir, entry);
      if (!existsSync(file)) { continue; }
      const stat = Bun.file(file);
      hash.update(rel);
      hash.update(entry);
      hash.update(String(stat.size));
      hash.update(String(stat.lastModified));
    }
  }
  return hash.digest("hex");
}

function ensureFrontendBuild(): string {
  const root = join(import.meta.dir, "..", "..", "..",);
  const distPublic = join(root, "dist", "public");
  const jsPath = join(distPublic, "app.js");
  const hashPath = join(distPublic, ".build-hash");
  const expectedHash = hashFrontendSources(root);
  if (
    existsSync(jsPath) &&
    existsSync(hashPath) &&
    readFileSync(hashPath, "utf8") === expectedHash
  ) { return distPublic; }

  const result = spawnSync("bun", ["run", "build:frontend"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: root,
  });
  if (result.status !== 0) {
    throw new Error(`Frontend build failed: ${result.stderr?.toString()}`);
  }

  const srcViews = join(root, "src", "views");
  const srcPublic = join(root, "src", "public");
  if (existsSync(srcViews)) { cpSync(srcViews, distPublic, { recursive: true, force: true }); }
  if (existsSync(srcPublic)) { cpSync(srcPublic, distPublic, { recursive: true, force: true }); }
  writeFileSync(hashPath, expectedHash);

  return distPublic;
}

// ── Create browser test context ──────────────────────────────

export async function createBrowserTest(
  overrides?: Omit<Partial<Config>, "auth"> & { auth?: Partial<Config["auth"]> },
): Promise<BrowserTestContext> {
  const publicDir = ensureFrontendBuild();

  // Use crypto.randomUUID() so concurrent workers can't collide on
  // millisecond+Math.random() (BUG-test-run-id-uses-Date-now-collision-risk-under-parallel).
  const testRunId = `loop-lore-e2e-${crypto.randomUUID()}`;
  // TS-22/23/24: Bun.Server has `port: number` and `stop(): Promise<void>`.
  let bunServer: Bun.Server<undefined> | null = null;
  let browser: Browser | null = null;
  try {
    // Create DB + run migrations
    const db = createTestDb();
    await runMigrations(db,);

    const config = loadTestConfig(overrides,);

    // Temp upload dir
    const testUploadDir = join("/tmp", testRunId, "uploads",);
    config.assets.uploadDir = testUploadDir;
    mkdirSync(testUploadDir, { recursive: true, },);

    // Initialize singletons
    const logger = createLogger({ level: "error", },);
    setGlobalLogger(logger,);
    initAgeGate(config.ageGate,);
    await initSmk(config.encryption,);
    initializeProviders(config,);
    await loadAllPlugins(db,);

    // Seed chat setup templates (server.start.ts:117 calls this in
    // production; without it, /api/worlds/:wid/locations returns 400
    // "Chat setup template not found" because resolveLocationTemplate
    // defaults to id="template-world").
    const { seedChatSetupTemplates, } = await import("@/chat/service");
    await seedChatSetupTemplates(db,);

    // Seed solo user + character visible to solo context
    await seedSolo(db,);
    resetSoloUserCache();

    // Create Elysia app with a non-API handler that serves static files
    const app = createApp({
      database: db,
      config,
      handleApiRequest,
      handleNonApiRequest: async (request: Request,): Promise<Response> => {
        const url = new URL(request.url,);
        const publicPath = join(publicDir, url.pathname === "/" ? "index.html" : url.pathname,);
        if (publicPath.startsWith(`${publicDir}/`,) && existsSync(publicPath,)) {
          const content = readFileSync(publicPath,);
          const ext = publicPath.split(".",).pop()?.toLowerCase() ?? "";
          const mime: Record<string, string> = {
            html: "text/html",
            css: "text/css",
            js: "application/javascript",
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            svg: "image/svg+xml",
            ico: "image/x-icon",
          };
          return new Response(content, { headers: { "Content-Type": mime[ext] ?? "text/plain", }, },);
        }
        return new Response("Not found", { status: 404, },);
      },
    },);

    // Start Bun server
    bunServer = Bun.serve({
      port: 0,
      fetch: (req,) => app.fetch(req,),
    },);

    const url = `http://localhost:${bunServer.port}`;

    browser = await chromium.launch({ headless: true, },);

    // Create browser context with generous viewport so sidebar nav is visible.
    // Cast to Browser — BrowserContext also has newPage() and is compatible
    // at runtime with the BrowserTestContext interface.
    const browserContext = await browser.newContext({
      viewport: { width: 1440, height: 900, },
    },);

    // Track open pages so a timed-out test can't leak its page into the next test.
    const openPages = new Set<Page>();
    browserContext.on("page", (page,) => {
      openPages.add(page,);
      page.once("close", () => openPages.delete(page,),);
    },);

    return {
      url,
      db,
      config,
      browser: browserContext as unknown as Browser,
      openPage: async () => browserContext.newPage(),
      closeAllPages: async () => {
        // Close in reverse order (newest first) to avoid detached-frame races.
        const pages = [...openPages,];
        pages.reverse();
        await Promise.allSettled(pages.map(async (page,) => {
          try {
            await page.close();
          } catch { /* already detached */ }
        },),);
        openPages.clear();
      },
      close: async () => {
        await browser?.close();
        void bunServer?.stop();
        setTestDatabase(null,);
        resetSoloUserCache();
        await unloadAllPlugins();
        const testDir = join("/tmp", testRunId,);
        if (existsSync(testDir,)) { rmSync(testDir, { recursive: true, force: true, },); }
      },
    };
  } catch (err) {
    // Clear the module-global override and any partial upload dir if setup
    // throws mid-way (BUG-settestdatabase-global-leak-on-test-throw).
    await browser?.close();
    void bunServer?.stop();
    setTestDatabase(null,);
    const testDir = join("/tmp", testRunId,);
    if (existsSync(testDir,)) { rmSync(testDir, { recursive: true, force: true, },); }
    throw err;
  }
}
