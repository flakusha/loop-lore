// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { spawnSync, } from "node:child_process";
import { existsSync, statSync, } from "node:fs";
import { join, } from "node:path";
import { compressAssets, copyDirectory, } from "../content/compress";
import { injectContentHashes, } from "../content/hash-injection";
import type { Logger, } from "../logger/types";
import { DOCS_PATH, walkDirectorySync, } from "./static-files";

/**
 * Ensure the frontend bundle exists (auto-build if missing), copy source
 * public/views into dist, pre-compress static assets, and inject content-hash
 * references into HTML for immutable-cache support.
 *
 * All paths are resolved relative to this module's location in the built tree.
 */
export async function initAssetCompression(logger: Logger,): Promise<void> {
  const distPublic = join(import.meta.dir, "..", "..", "dist", "public",);
  const jsTarget = join(distPublic, "app.js",);

  // ── Auto-build frontend JS if missing ────────────────────
  if (!existsSync(jsTarget,)) {
    logger.info({ message: "Frontend JS not built — auto-building...", },);
    const result = spawnSync("bun", ["run", "build:frontend",], {
      stdio: ["ignore", "inherit", "inherit",],
    },);
    if (result.status === 0) {
      logger.info({ message: "Frontend build complete", },);
    } else {
      logger.error({ message: "Frontend build failed — some features unavailable", },);
    }
  }

  const sourcePublicDirectory = join(import.meta.dir, "..", "..", "src", "public",);
  const sourceViewsDirectory = join(import.meta.dir, "..", "..", "src", "views",);
  const destinationPublicDirectory = join(import.meta.dir, "..", "..", "dist", "public",);

  // Helper: check if source is newer than destination
  function needsCompression(srcDir: string, destDir: string,): boolean {
    if (!existsSync(destDir,)) { return true; }
    const srcFiles = walkDirectorySync(srcDir,);
    for (const f of srcFiles) {
      const srcPath = join(srcDir, f,);
      const destPath = join(destDir, f,);
      if (!existsSync(destPath,)) { return true; }
      const srcStat = statSync(srcPath,);
      const destStat = statSync(destPath,);
      if (srcStat.mtimeMs > destStat.mtimeMs) { return true; }
    }
    return false;
  }

  // ── Pre-compress static assets (parallel, graceful on failure) ──
  const compressionJobs: { label: string; src: string; dest: string }[] = [];
  if (existsSync(sourcePublicDirectory,)) {
    copyDirectory(sourcePublicDirectory, destinationPublicDirectory,);
    if (needsCompression(sourcePublicDirectory, destinationPublicDirectory,)) {
      compressionJobs.push({ label: "public", src: sourcePublicDirectory, dest: destinationPublicDirectory, },);
    }
  }
  if (existsSync(sourceViewsDirectory,)) {
    copyDirectory(sourceViewsDirectory, destinationPublicDirectory,);
    if (needsCompression(sourceViewsDirectory, destinationPublicDirectory,)) {
      compressionJobs.push({ label: "views", src: sourceViewsDirectory, dest: destinationPublicDirectory, },);
    }
  }
  if (existsSync(DOCS_PATH,)) {
    compressionJobs.push({ label: "docs", src: DOCS_PATH, dest: DOCS_PATH, },);
  }

  if (compressionJobs.length > 0) {
    const promises: Promise<void>[] = [];
    for (const job of compressionJobs) {
      promises.push(
        (async () => {
          const result = await compressAssets(job.src, job.dest,);
          if (result.total > 0) {
            logger.info({
              message: `Compressed ${job.label}`,
              total: result.total,
              bytes: result.originalBytes,
              gz: result.compressedBytes.gz,
              zst: result.compressedBytes.zst,
              br: result.compressedBytes.br,
            },);
          }
        })(),
      );
    }
    const results = await Promise.allSettled(promises,);
    for (const r of results) {
      if (r.status === "rejected") {
        logger.warn({ message: "Asset compression failed", error: String(r.reason,), },);
      }
    }
  }

  // Inject content-hashed filenames into HTML (enables immutable cache for hashed assets).
  // Runs after copyDirectory so newly-copied HTML templates also get hashed references.
  const hashResult = injectContentHashes(destinationPublicDirectory,);
  if (hashResult.replaced > 0) {
    logger.info({
      message: "Hash-injected references",
      replaced: hashResult.replaced,
      skipped: hashResult.skipped,
    },);
  }
}
