/**
 * Browser E2E Test Server
 *
 * Extends the backend test server with full frontend serving (static files,
 * view templates, htmx endpoints). Provides Playwright browser fixture.
 *
 * Usage:
 *   const ctx = await createBrowserTest();
 *   const page = await ctx.browser.newPage();
 *   await page.goto(ctx.url + "/views/chat");
 *   await ctx.close();
 */

import { chromium, type Browser, type Page } from "@playwright/test";
import { join, normalize } from "node:path";
import { existsSync, readFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createTestDb, runMigrations, loadTestConfig } from "./server";
import { handleApiRequest } from "@/server";
import { dispatch } from "@/routes/views";
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

// ── MIME types (mirrored from server.ts, not exported) ──────

const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff2: "font/woff2",
  gz: "application/gzip",
  br: "application/brotli",
  zst: "application/zstd",
};

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "text/plain";
}

// ── Types ────────────────────────────────────────────────────

export interface BrowserTestContext {
  url: string;
  db: Kysely<DB>;
  config: Config;
  browser: Browser;
  page: Page;
  close: () => Promise<void>;
}

// ── Build frontend JS/CSS first ──────────────────────────────

function ensureFrontendBuild(): string {
  const distPublic = join(import.meta.dir, "..", "..", "..", "dist", "public");
  const jsPath = join(distPublic, "app.js");
  if (existsSync(jsPath)) return distPublic;

  // Auto-build frontend
  const result = spawnSync("bun", ["run", "build:frontend"], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: join(import.meta.dir, "..", "..", ".."),
  });
  if (result.status !== 0) {
    throw new Error(`Frontend build failed: ${result.stderr?.toString()}`);
  }
  
  // Copy src/views + src/public to dist/public (compress.ts does this in build)
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
  // Build frontend if needed
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
  // Reset SMK from any prior unit tests — test config has no encryption key
  await initSmk(config.encryption);
  initializeProviders(config);
  await loadAllPlugins(db);

  // Start Bun server with full frontend pipeline
  const bunServer = Bun.serve({
    port: 0,
    fetch: async (req: Request): Promise<Response> => {
      const url = new URL(req.url);

      // ── API routes ──────────────────────────────────
      if (url.pathname.startsWith("/api/")) {
        return handleApiRequest(req, db, config);
      }

      // ── View routes (htmx pages) ────────────────────
      const viewResponse = await dispatch({
        request: req,
        context: { userId: null, userRole: null, sessionId: null },
        database: db,
        config,
      });
      if (viewResponse) return viewResponse;

      // ── Static files (CSS, JS, images) ──────────────
      const publicPath = normalize(join(publicDir, url.pathname === "/" ? "index.html" : url.pathname));
      if (publicPath.startsWith(normalize(join(publicDir, "/")))) {
        let fullPath = publicPath;
        if (!existsSync(fullPath)) {
          const htmlPath = fullPath + ".html";
          if (existsSync(htmlPath)) fullPath = htmlPath;
        }
        if (existsSync(fullPath)) {
          const acceptEncoding = req.headers.get("accept-encoding") ?? "";
          const variant = findCompressedVariant(fullPath, acceptEncoding);
          if (variant) {
            const content = readFileSync(variant.path);
            return new Response(content, {
              headers: {
                "Content-Type": getContentType(variant.path),
                "Content-Encoding": variant.encoding,
                Vary: "Accept-Encoding",
              },
            });
          }
          const content = readFileSync(fullPath);
          return new Response(content, {
            headers: { "Content-Type": getContentType(fullPath) },
          });
        }
      }

      return new Response("Not found", { status: 404 });
    },
  });

  const url = `http://localhost:${bunServer.port}`;

  // Launch Playwright browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  return {
    url,
    db,
    config,
    browser,
    page,
    close: async () => {
      await browser.close();
      bunServer.stop();
      setTestDatabase(null);
      resetSoloUserCache();
      await unloadAllPlugins();
      const testDir = join("/tmp", testRunId);
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    },
  };
}

// ── Compressed variant lookup (mirror of server.ts) ─────────

const COMPRESSIBLE_EXTS = new Set([".css", ".js", ".html", ".json", ".svg"]);

function isCompressible(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext ? COMPRESSIBLE_EXTS.has(`.${ext}`) : false;
}

function findCompressedVariant(
  filePath: string,
  acceptEncoding: string,
): { path: string; encoding: string } | null {
  if (!isCompressible(filePath)) return null;

  const encodings = new Set<string>();
  for (const enc of acceptEncoding.split(",")) encodings.add(enc.trim().toLowerCase());

  if (encodings.has("br") && existsSync(`${filePath}.br`)) {
    return { path: `${filePath}.br`, encoding: "br" };
  }
  if (encodings.has("zstd") && existsSync(`${filePath}.zst`)) {
    return { path: `${filePath}.zst`, encoding: "zstd" };
  }
  if (encodings.has("gzip") && existsSync(`${filePath}.gz`)) {
    return { path: `${filePath}.gz`, encoding: "gzip" };
  }
  return null;
}
