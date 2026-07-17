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

import { chromium, type Browser } from "@playwright/test";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createTestDb, runMigrations, loadTestConfig } from "./server";
import "./logger-init";
import { createApp } from "@/elysia-app";
import { seedSolo } from "./seed";
import { createLogger, setGlobalLogger } from "@/logger";
import { initAgeGate } from "@/age-gate/controller";
import { initializeProviders } from "@/generation";
import { setTestDatabase } from "@/db/index";
import { initSmk } from "@/crypto";
import { resetSoloUserCache } from "@/middleware/index";
import type { DB } from "@/db/schema";
import type { Config } from "@/config/schema";
import type { Kysely } from "kysely";
import { loadAllPlugins, unloadAllPlugins } from "@/plugins";

// ── Types ────────────────────────────────────────────────────

export interface BrowserTestContext {
  url: string;
  db: Kysely<DB>;
  config: Config;
  browser: Browser;
  close: () => Promise<void>;
}

// ── Build frontend JS/CSS first ──────────────────────────────

function ensureFrontendBuild(): string {
  const distPublic = join(import.meta.dir, "..", "..", "..", "dist", "public");
  const jsPath = join(distPublic, "app.js");
  if (existsSync(jsPath)) return distPublic;

  const result = spawnSync("bun", ["run", "build:frontend"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: join(import.meta.dir, "..", "..", ".."),
  });
  if (result.status !== 0) {
    throw new Error(`Frontend build failed: ${result.stderr?.toString()}`);
  }

  const srcViews = join(import.meta.dir, "..", "..", "..", "src", "views");
  const srcPublic = join(import.meta.dir, "..", "..", "..", "src", "public");
  if (existsSync(srcViews)) cpSync(srcViews, distPublic, { recursive: true, force: true });
  if (existsSync(srcPublic)) cpSync(srcPublic, distPublic, { recursive: true, force: true });

  return distPublic;
}

// ── Create browser test context ──────────────────────────────

export async function createBrowserTest(
  overrides?: Partial<Config>,
): Promise<BrowserTestContext> {
  const publicDir = ensureFrontendBuild();

  // Create DB + run migrations
  const db = createTestDb();
  await runMigrations(db);

  const config = loadTestConfig(overrides);

  // Temp upload dir
  const testRunId = `loop-lore-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testUploadDir = join("/tmp", testRunId, "uploads");
  config.assets.uploadDir = testUploadDir;
  mkdirSync(testUploadDir, { recursive: true });

  // Initialize singletons
  const logger = createLogger({ level: "error" });
  setGlobalLogger(logger);
  initAgeGate(config.ageGate);
  await initSmk(config.encryption);
  initializeProviders(config);
  await loadAllPlugins(db);

  // Seed solo user + character visible to solo context
  await seedSolo(db);
  resetSoloUserCache();

  // Create Elysia app with a non-API handler that serves static files
  const app = createApp({
    database: db,
    config,
    handleNonApiRequest: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const publicPath = join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (publicPath.startsWith(publicDir + "/") && existsSync(publicPath)) {
        const content = readFileSync(publicPath);
        const ext = publicPath.split(".").pop()?.toLowerCase() ?? "";
        const mime: Record<string, string> = {
          html: "text/html", css: "text/css", js: "application/javascript",
          png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
          svg: "image/svg+xml", ico: "image/x-icon",
        };
        return new Response(content, { headers: { "Content-Type": mime[ext] ?? "text/plain" } });
      }
      return new Response("Not found", { status: 404 });
    },
  });

  // Start Bun server
  const bunServer = Bun.serve({
    port: 0,
    fetch: (req) => app.fetch(req),
  });

  const url = `http://localhost:${bunServer.port}`;

  const browser = await chromium.launch({ headless: true });

  return {
    url,
    db,
    config,
    browser,
    close: async () => {
      await browser.close();
      bunServer.stop();
      setTestDatabase(null);
      resetSoloUserCache();
      await unloadAllPlugins();
      const testDir = join("/tmp", testRunId);
      if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
    },
  };
}