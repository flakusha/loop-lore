// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { spawnSync, } from "node:child_process";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, } from "node:path";
import { acquireBuildLock, } from "./build-lock";

/**
 * Hash-keyed docs-dist cache for the browser suite's docs build.
 *
 * The vitepress build over the ~4,700-page plan-gen corpus needs more heap
 * than Node's default and minutes of wall time (see
 * `.tmp/research/Finalize-Heap-Memory.md` §1-§3). This helper:
 * - skips entirely when `docs/.vitepress/dist` is already complete,
 * - otherwise consults a content-addressed cache at
 *   `.tmp/docs-dist-cache/<hash>/` and installs a hit by copying the cached
 *   tree into `dist/`,
 * - on a miss builds ONCE into `dist/` (with the heap flag codified below),
 *   then publishes the tree into the cache behind an atomic rename.
 *
 * Hash input set (documented contract): every file under `docs/` except the
 * derived/generated trees — `.vitepress/dist`, `.vitepress/cache` (build
 * outputs) and `plan-gen/` (regenerated from `.plan/` by sync-docs on every
 * build, mtimes churn) — plus `.plan/` itself, the sync-docs mirror source.
 * Hashed by relative path + size + mtime, the same scheme as
 * `hashFrontendSources`.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..", "..",);
const DIST_DIR = join(REPO_ROOT, "docs", ".vitepress", "dist",);
const CACHE_ROOT = join(REPO_ROOT, ".tmp", "docs-dist-cache",);
const CACHE_LOCK = join(CACHE_ROOT, ".build.lock",);
/** Published caches older than this are pruned (finalize cadence, not minutes). */
const STALE_CACHE_MS = 24 * 60 * 60 * 1000;
const COMPLETION_MARKERS = ["index.html", "hashmap.json",] as const;

/** V8 heap ceiling for the docs build child only. Node 26 defaults to 4192MB
 * and the vitepress SSG phase OOMs at that ceiling
 * (`.tmp/research/Finalize-Heap-Memory.md` §1.1: `Ineffective mark-compacts`
 * at ~4098MB after 206-233s; passing runs need 6144MB). Scoped here so
 * finalize never depends on an operator-exported NODE_OPTIONS; only this
 * child inherits the bump. */
const DOCS_BUILD_NODE_OPTIONS = "--max-old-space-size=6144";

function distIsComplete(dir: string,): boolean {
  return COMPLETION_MARKERS.every((marker,) => existsSync(join(dir, marker,),));
}

/** Hash the documented input set: docs/** minus build outputs, plus .plan/**. */
function hashDocsSources(): string {
  const hash = new Bun.CryptoHasher("sha256",);
  const roots: Array<{ dir: string; skip: (rel: string,) => boolean }> = [
    {
      dir: join(REPO_ROOT, "docs",),
      skip: (rel,) =>
        rel.startsWith(".vitepress/dist",) ||
        rel.startsWith(".vitepress/cache",) ||
        rel.startsWith("plan-gen/",),
    },
    { dir: join(REPO_ROOT, ".plan",), skip: () => false, },
  ];

  for (const { dir, skip, } of roots) {
    if (!existsSync(dir,)) { continue; }
    const files = [...new Bun.Glob("**/*",).scanSync({ cwd: dir, dot: true, },),].sort();
    for (const entry of files) {
      if (skip(entry,)) { continue; }
      const file = join(dir, entry,);
      let stat;
      try {
        stat = statSync(file,);
      } catch {
        continue;
      }

      if (!stat.isFile()) { continue; }
      hash.update("docs",);
      hash.update(entry,);
      hash.update(String(stat.size,),);
      hash.update(String(Bun.file(file,).lastModified,),);
    }
  }

  return hash.digest("hex",);
}

function cacheIsReady(cacheDir: string, expectedHash: string,): boolean {
  const hashPath = join(cacheDir, ".build-hash",);
  if (!existsSync(hashPath,) || readFileSync(hashPath, "utf8",) !== expectedHash) { return false; }
  return distIsComplete(cacheDir,);
}

function removeStaleCaches(keep: string,): void {
  const cutoff = Date.now() - STALE_CACHE_MS;
  for (const entry of readdirSync(CACHE_ROOT, { withFileTypes: true, },)) {
    if (!entry.isDirectory() || entry.name === keep) { continue; }
    const path = join(CACHE_ROOT, entry.name,);
    if (statSync(path,).mtimeMs > cutoff) { continue; }
    rmSync(path, { recursive: true, force: true, },);
  }
}

function runDocsBuild(): void {
  const result = spawnSync("bun", ["run", "docs:build",], {
    stdio: ["ignore", "pipe", "pipe",],
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_OPTIONS: DOCS_BUILD_NODE_OPTIONS, },
  },);

  const output = `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`;
  if (result.status !== 0) {
    if (output.includes("Ineffective mark-compacts",)) {
      throw new Error(
        `docs:build ran out of V8 heap even with ${DOCS_BUILD_NODE_OPTIONS}` +
          " — the corpus outgrew the codified ceiling (see .tmp/research/" +
          "Finalize-Heap-Memory.md §2/§3). Do NOT raise the flag silently.",
      );
    }

    throw new Error(`docs:build failed (exit ${result.status ?? "unknown"}): ${output.slice(-4000,)}`,);
  }

  if (!distIsComplete(DIST_DIR,)) {
    throw new Error("docs:build exited 0 but left an incomplete dist (missing completion markers)",);
  }
}

/** Replace `dist/` with a copy of the cached tree. */
function installFromCache(cacheDir: string,): void {
  rmSync(DIST_DIR, { recursive: true, force: true, },);
  cpSync(cacheDir, DIST_DIR, { recursive: true, force: true, },);
  // The cache marker is metadata, not site content.
  unlinkSync(join(DIST_DIR, ".build-hash",),);
}

/** Publish the freshly built `dist/` into the cache via staging + rename. */
function publishToCache(cacheDir: string, expectedHash: string,): void {
  const staging = `${cacheDir}.staging-${process.pid}`;
  rmSync(staging, { recursive: true, force: true, },);
  cpSync(DIST_DIR, staging, { recursive: true, force: true, },);
  writeFileSync(join(staging, ".build-hash",), expectedHash,);
  rmSync(cacheDir, { recursive: true, force: true, },);
  renameSync(staging, cacheDir,);
}

/**
 * Ensure `docs/.vitepress/dist` holds a complete docs build, via the
 * content-addressed cache when possible. Same skip semantics as the
 * previous in-spec check: a complete dist short-circuits everything.
 *
 * @throws Propagates docs build failures (with OOM-specific messaging) and
 * cache/lock filesystem failures.
 */
export function ensureDocsBuild(): void {
  if (distIsComplete(DIST_DIR,)) { return; }

  const expectedHash = hashDocsSources();
  const cacheDir = join(CACHE_ROOT, expectedHash.slice(0, 16,),);
  mkdirSync(CACHE_ROOT, { recursive: true, },);
  const lockFd = acquireBuildLock(CACHE_LOCK, () => cacheIsReady(cacheDir, expectedHash,),);
  if (lockFd === null) {
    // Another worker finished the build and published the cache; install it.
    installFromCache(cacheDir,);
    return;
  }

  try {
    if (cacheIsReady(cacheDir, expectedHash,)) {
      installFromCache(cacheDir,);
      return;
    }

    runDocsBuild();
    publishToCache(cacheDir, expectedHash,);
    removeStaleCaches(expectedHash.slice(0, 16,),);
  } finally {
    closeSync(lockFd,);
    unlinkSync(CACHE_LOCK,);
  }
}
