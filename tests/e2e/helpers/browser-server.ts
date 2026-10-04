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
 *   const page = await ctx.openPage();
 *   await page.goto(ctx.url + "/views/chat");
 *   await ctx.close();
 */
import "./logger-init";
import { initAgeGate, } from "@/age-gate/controller";
import { flushActiveStore, } from "@/async";
import type { Config, } from "@/config/schema";
import { initSmk, } from "@/crypto";
import { setTestDatabase, } from "@/db/index";
import type { DB, } from "@/db/schema";
import { createApp, } from "@/elysia-app";
import { initializeProviders, registerProvider, } from "@/generation";
import { createLogger, setGlobalLogger, } from "@/logger";
import { resetSoloUserCache, } from "@/middleware/index";
import { loadAllPlugins, unloadAllPlugins, } from "@/plugins";
import { handleApiRequest, } from "@/server";
import { MockLLMProvider, } from "@/test-utils/mock-provider";
import { type Browser, type BrowserContext, chromium, type Page, } from "@playwright/test";
import type { Kysely, } from "kysely";
import { existsSync, mkdirSync, readFileSync, rmSync, } from "node:fs";
import { join, } from "node:path";
import { ensureFrontendBuild, } from "./browser-frontend-build";
import { seedSolo, } from "./seed";
import { createTestDb, loadTestConfig, runMigrations, } from "./server";

// ── Types ────────────────────────────────────────────────────

export interface BrowserTestContext {
  url: string;
  db: Kysely<DB>;
  config: Config;
  browser: BrowserContext;
  /** Open a page and track it so a test failure can't leak it into the next test. */
  openPage: () => Promise<Page>;
  /** Close every page still open (call in afterEach/finally to prevent failure cascade). */
  closeAllPages: () => Promise<void>;
  close: () => Promise<void>;
}

let activeBrowserContext = false;

/**
 * Upper bound for a single `page.close()`. A page mid-navigation (e.g. the
 * locale switch's `location.reload()`) can make Chromium withhold the close
 * acknowledgement, which otherwise hangs the test - or the whole suite
 * teardown - with no timeout of its own.
 */
const CLOSE_TIMEOUT_MS = 5_000;

// ── Create browser test context ──────────────────────────────

export async function createBrowserTest(
  overrides?: Omit<Partial<Config>, "auth"> & { auth?: Partial<Config["auth"]> },
): Promise<BrowserTestContext> {
  const publicDir = ensureFrontendBuild();
  if (activeBrowserContext) {
    throw new Error("Browser E2E uses process-global app state; create one context per worker process.",);
  }

  activeBrowserContext = true;

  // Use crypto.randomUUID() so concurrent workers can't collide on
  // millisecond+Math.random() (BUG-test-run-id-uses-Date.now-collision-risk-under-parallel).
  const testRunId = `loop-lore-e2e-${crypto.randomUUID()}`;
  let bunServer: Bun.Server<undefined> | null = null;
  let browser: Browser | null = null;
  let db: Kysely<DB> | null = null;
  let closed = false;

  /** @throws Propagates the first resource teardown failure after releasing all resources. */
  async function cleanup(): Promise<void> {
    if (closed) { return; }
    closed = true;
    // Teardown order matters and the phases are sequential, not parallel:
    //   1. stop accepting work, so nothing enqueues a new write after the flush
    //   2. drain the store's fire-and-forget queue against a still-open handle
    //   3. only then destroy the DB
    // Destroying the handle in the same tick as the queued writes leaves them in
    // flight against a closed database (`RangeError: Cannot use a closed
    // database`), which the drain loop logs and swallows — the noise this
    // ordering removes. BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s.
    const teardown = await Promise.allSettled([browser?.close(), bunServer?.stop(),],);
    await flushActiveStore();
    const dbTeardown = await Promise.allSettled([db?.destroy(),],);
    teardown.push(...dbTeardown,);
    setTestDatabase(null,);
    resetSoloUserCache();
    activeBrowserContext = false;
    try {
      await unloadAllPlugins();
    } finally {
      const testDir = join("/tmp", testRunId,);
      if (existsSync(testDir,)) { rmSync(testDir, { recursive: true, force: true, },); }
    }

    const failure = teardown.find((result,): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) { throw failure.reason; }
  }

  try {
    // Create DB + run migrations
    db = createTestDb();
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
    // Browser tests mount views that resolve a default model/provider at Alpine
    // init (chat settings, VN settings). config.yaml may point defaultProvider at a
    // real endpoint, so pin the mock as default and drop real providers — same
    // contract as createTestServer(registerMock) in helpers/server.ts.
    registerProvider("mock-provider", new MockLLMProvider(),);
    config.generation.defaultProvider = "mock-provider";
    config.generation.defaultModels["mock-provider"] = "mock-model";
    config.generation.providers.openaiCompatible = [];
    initializeProviders(config,);
    await loadAllPlugins(db,);

    // Seed chat setup templates (server.start.ts:117 calls this in
    // production; without it, /api/v1/worlds/:wid/locations returns 400
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
      browser: browserContext,
      openPage: async () => browserContext.newPage(),
      closeAllPages: async () => {
        // Close in reverse order (newest first) to avoid detached-frame races.
        const pages = [...openPages,];
        pages.reverse();
        let abandoned = 0;
        await Promise.allSettled(pages.map(async (page,) => {
          // Best-effort with a bound: a page we give up on is still reaped by
          // the context teardown in cleanup(). The catch counts the abandoned
          // promise instead of surfacing an unhandled rejection.
          const closing = page.close().catch(() => {
            abandoned += 1;
          },);

          await Promise.race([closing, Bun.sleep(CLOSE_TIMEOUT_MS,),],);
        },),);

        openPages.clear();
        if (abandoned > 0) {
          logger.warn(`closeAllPages: ${abandoned} page close(s) abandoned to context teardown`,);
        }
      },
      close: cleanup,
    };
  } catch (err) {
    // Teardown failure must not mask the setup error — cleanup's own
    // rejection is swallowed so the original `err` always propagates.
    await cleanup().catch((): null => null);
    throw err;
  }
}
