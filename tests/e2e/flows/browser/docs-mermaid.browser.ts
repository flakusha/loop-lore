// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser E2E: Docs site mermaid render
 *
 * Builds `docs/.vitepress/dist` (if missing) and serves it under a
 * `/docs/...` URL prefix that matches VitePress's `base: '/docs/'`
 * setting. Then walks the dist for every HTML page containing a
 * `<div class="mermaid">` block, opens each one in headless
 * Chromium, and asserts that vitepress-mermaid-renderer has inserted
 * an `<svg>` child inside every `.mermaid` block.
 *
 * This is a behavior gate, not a parse gate — `bun run mermaid:lint`
 * (mmdlint via @mermaid-js/parser) covers parse-time validation. This
 * test covers render-time: a future theme/plugin regression that
 * leaves `.mermaid` blocks empty would slip past mmdlint but fail
 * here. Page enumeration is automatic so adding a new ```mermaid
 * block to any docs/{meta,spec,frontend,...}/**.md file picks up
 * coverage with no test edits.
 */
import { type Browser, chromium, type Page, } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import { join, relative, } from "node:path";
import { trackPageErrors, } from "../../helpers/htmx-alpine";

// ── Fixtures (paths from repo root) ────────────────────────────

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..",);
const DIST_DIR = join(REPO_ROOT, "docs", ".vitepress", "dist",);

// ── Build the docs site if needed ─────────────────────────────

function ensureDocsBuild(): void {
  if (existsSync(join(DIST_DIR, "index.html",),)) { return; }
  const result = spawnSync("bun", ["run", "docs:build",], {
    stdio: ["ignore", "pipe", "pipe",],
    cwd: REPO_ROOT,
  },);
  if (result.status !== 0) {
    throw new Error(
      `docs:build failed (exit ${result.status ?? "unknown"}): ${result.stderr?.toString() ?? ""}`,
    );
  }
}

// ── Discover pages with mermaid blocks ────────────────────────

function findHtmlFiles(dir: string,): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir,)) {
    const p = join(dir, entry,);
    const s = statSync(p,);
    if (s.isDirectory()) {
      out.push(...findHtmlFiles(p,),);
    } else if (entry.endsWith(".html",)) {
      out.push(p,);
    }
  }
  return out;
}

function findMermaidPages(distDir: string,): string[] {
  if (!existsSync(distDir,)) { return []; }
  const mermaidPages: string[] = [];
  for (const file of findHtmlFiles(distDir,)) {
    const html = readFileSync(file, "utf8",);
    if (html.includes(`class="mermaid"`,)) {
      // Convert dist-relative path to URL path the server expects.
      // node:path `relative` uses platform separators (\ on Windows, /
      // on POSIX); normalize to forward slashes for the URL.
      const rel = relative(distDir, file,).replaceAll("\\", "/",);
      mermaidPages.push(`/docs/${rel}`,);
    }
  }
  mermaidPages.sort();
  return mermaidPages;
}

// ── Static server over the built dist (mounted at /docs/) ──────

interface DocsServer {
  url: string;
  stop: () => void;
}

const MIME: Readonly<Record<string, string>> = Object.freeze({
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ico: "image/x-icon",
  woff2: "font/woff2",
  map: "application/json; charset=utf-8",
},);

function startDocsServer(): DocsServer {
  const server = Bun.serve({
    port: 0,
    fetch(req,) {
      const url = new URL(req.url,);
      // Serve dist at /docs/* (matches vitepress `base: '/docs/'`).
      if (url.pathname === "/docs" || url.pathname === "/docs/") {
        return new Response(Bun.file(join(DIST_DIR, "index.html",),), {
          headers: { "Content-Type": MIME.html, },
        },);
      }
      if (url.pathname.startsWith("/docs/",)) {
        const rel = url.pathname.slice("/docs/".length,);
        const filePath = join(DIST_DIR, rel,);
        const file = Bun.file(filePath,);
        if (file.size > 0) {
          const ext = rel.split(".",).pop()?.toLowerCase() ?? "";
          return new Response(file, {
            headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", },
          },);
        }
      }
      return new Response("Not found", { status: 404, },);
    },
  },);
  return {
    url: `http://localhost:${server.port}`,
    stop: () => server.stop(true,),
  };
}

// ── Test suite ────────────────────────────────────────────────

// Enumerate at module-load time so the per-page test list is populated
// before bun:test starts running anything (the for-loop at the bottom
// builds the test cases at module level, not inside beforeAll).
ensureDocsBuild();
const PAGES = findMermaidPages(DIST_DIR,);
if (PAGES.length === 0) {
  // Throw at load so the whole file fails loudly rather than silently
  // producing zero tests. A future vitepress-plugin-mermaid regression
  // that consumes class="mermaid" before render would land here.
  throw new Error(
    'findMermaidPages returned 0 pages — has the renderer stopped emitting class="mermaid" divs? Check docs/.vitepress/config.mts (withMermaid) + theme/index.ts (createMermaidRenderer).',
  );
}

describe("Docs site mermaid renderer", () => {
  let server: DocsServer;
  let browser: Browser;
  const openedPages: Page[] = [];

  beforeAll(async () => {
    server = startDocsServer();
    browser = await chromium.launch({ headless: true, },);
  }, 120_000,);

  afterAll(async () => {
    await Promise.allSettled(openedPages.map((p,) => p.close().catch(() => {},)),);
    await browser?.close();
    server?.stop();
  },);

  // Per page: navigate, wait for .mermaid, wait for svg, assert >= 1.
  for (const path of PAGES) {
    test(`${path} renders at least one svg inside .mermaid`, async () => {
      const page = await browser.newPage();
      openedPages.push(page,);
      const errors = trackPageErrors(page,);
      try {
        await page.goto(server.url + path, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        },);
        // Renderer runs after DOMContentLoaded via MutationObserver; wait
        // until every .mermaid has an svg child (15s budget).
        await page.waitForFunction(() => {
          const blocks = document.querySelectorAll(".mermaid",);
          if (blocks.length === 0) { return false; }
          return Array.from(blocks,).every((el,) => el.querySelector("svg",));
        }, { timeout: 15_000, },);
        const svgCount = await page.locator(".mermaid svg",).count();
        expect(svgCount,).toBeGreaterThan(0,);
        // Sanity: every .mermaid block rendered at least one svg
        const blockCount = await page.locator(".mermaid",).count();
        expect(svgCount,).toBeGreaterThanOrEqual(blockCount,);
      } finally {
        errors.assert();
        errors.detach();
      }
    }, 45_000,);
  }
});
