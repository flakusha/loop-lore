// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, } from "node:path";

/**
 * Prefix for the immutable, hash-named trees the browser suite serves from.
 * `scripts/build-frontend.mjs` hardcodes its output at `dist/public`, so the
 * finished tree is copied into a private staging dir and published under this
 * prefix with `rename()` — which is atomic, so no worker can ever read a
 * half-written build. A published dir is never mutated again.
 */
const E2E_BUILD_PREFIX = "public-e2e-";
function hashFrontendSources(root: string,): string {
  const hash = new Bun.CryptoHasher("sha256",);
  const inputs = ["src/frontend", "src/views", "src/public",];
  for (const rel of inputs) {
    const dir = join(root, rel,);
    if (!existsSync(dir,)) { continue; }
    const files = [...new Bun.Glob("**/*",).scanSync({ cwd: dir, dot: false, },),].sort();
    for (const entry of files) {
      const file = join(dir, entry,);
      if (!existsSync(file,)) { continue; }
      const stat = Bun.file(file,);
      hash.update(rel,);
      hash.update(entry,);
      hash.update(String(stat.size,),);
      hash.update(String(stat.lastModified,),);
    }
  }

  return hash.digest("hex",);
}

function processIsRunning(pid: number,): boolean {
  try {
    process.kill(pid, 0,);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function acquireBuildLock(lockPath: string, isReady: () => boolean,): number | null {
  while (!isReady()) {
    try {
      const fd = openSync(lockPath, "wx", 0o600,);
      writeSync(fd, `${process.pid}\n`,);
      return fd;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") { throw error; }
    }

    const ownerPid = Number(readFileSync(lockPath, "utf8",).trim(),);
    if (ownerPid > 0 && !processIsRunning(ownerPid,)) {
      try {
        unlinkSync(lockPath,);
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") { throw error; }
      }
    }

    Bun.sleepSync(25,);
  }

  return null;
}

/**
 * A published tree younger than this may still be served by a running suite, so
 * it is never pruned.
 */
const STALE_BUILD_MS = 60 * 60 * 1000;

/**
 * Drop published trees from earlier source hashes so `dist/` does not grow by
 * one ~6MB build per edit. Age-capped rather than pruned outright: a worker that
 * resolved before the sources changed keeps serving its tree for the rest of the
 * run, and deleting it under that worker is the very 404 this helper exists to
 * prevent. A suite run is minutes, so anything over an hour old is dead weight.
 */
function removeStaleBuilds(dist: string, keep: string,): void {
  const cutoff = Date.now() - STALE_BUILD_MS;
  for (const entry of readdirSync(dist, { withFileTypes: true, },)) {
    if (!entry.isDirectory() || !entry.name.startsWith(E2E_BUILD_PREFIX,)) { continue; }
    const path = join(dist, entry.name,);
    if (path === keep || statSync(path,).mtimeMs > cutoff) { continue; }
    rmSync(path, { recursive: true, force: true, },);
  }
}

/**
 * Resolve the frontend tree for this worker and return its absolute path.
 *
 * The path is content-addressed (`dist/public-e2e-<hash>`) and published by an
 * atomic `rename()` from a staging dir only this process writes, so every worker
 * either reads the previous complete build or the new complete build — never a
 * partially copied tree. A published tree is never rewritten, and is only pruned
 * once it is older than any plausible suite run (see `removeStaleBuilds`); that
 * immutability is what closes the shared-mutable-output race between workers.
 *
 * @throws Propagates frontend build and lock filesystem failures.
 */
export function ensureFrontendBuild(): string {
  const root = join(import.meta.dir, "..", "..", "..",);
  const dist = join(root, "dist",);
  // build:frontend's hardcoded output dir; its finished tree is copied out of
  // here, so nothing the e2e suite serves is ever read from a mutating dir.
  const distPublic = join(dist, "public",);
  const lockPath = join(dist, ".build-e2e.lock",);
  const expectedHash = hashFrontendSources(root,);
  const buildDir = join(dist, `${E2E_BUILD_PREFIX}${expectedHash.slice(0, 16,)}`,);
  const hashPath = join(buildDir, ".build-hash",);
  const isReady = () =>
    existsSync(join(buildDir, "alpine-init.js",),) && existsSync(hashPath,) &&
    readFileSync(hashPath, "utf8",) === expectedHash;

  mkdirSync(dist, { recursive: true, },);
  const lockFd = acquireBuildLock(lockPath, isReady,);
  if (lockFd === null) { return buildDir; }

  try {
    if (isReady()) { return buildDir; }

    const staging = join(dist, `${E2E_BUILD_PREFIX}staging-${process.pid}-${expectedHash.slice(0, 8,)}`,);
    rmSync(staging, { recursive: true, force: true, },);
    mkdirSync(staging, { recursive: true, },);
    // build:frontend/compress.ts expect their output dir to already exist.
    mkdirSync(distPublic, { recursive: true, },);

    const result = Bun.spawnSync(["bun", "run", "build:frontend",], {
      stdio: ["ignore", "pipe", "pipe",],
      cwd: root,
    },);

    if (result.exitCode !== 0) {
      throw new Error(`Frontend build failed: ${result.stderr.toString()}`,);
    }

    // Legacy markers from the pre-atomic layout, which lived inside the served
    // tree; drop them so they are not copied into the published build as dead
    // files (the real lock is now dist/.build-e2e.lock).
    for (const legacy of [".build-hash", ".build-lock",]) {
      const stale = join(distPublic, legacy,);
      if (existsSync(stale,)) { unlinkSync(stale,); }
    }

    // Bundles first, then the raw view/public trees over the top — same order
    // the previous in-place build used.
    cpSync(distPublic, staging, { recursive: true, force: true, },);
    const srcViews = join(root, "src", "views",);
    const srcPublic = join(root, "src", "public",);
    if (existsSync(srcViews,)) { cpSync(srcViews, staging, { recursive: true, force: true, },); }
    if (existsSync(srcPublic,)) { cpSync(srcPublic, staging, { recursive: true, force: true, },); }
    writeFileSync(join(staging, ".build-hash",), expectedHash,);

    // buildDir cannot be in use while !isReady(): a worker only ever returns it
    // once the hash matches, and a worker holding it never triggers a rebuild.
    // So removing a stale copy and renaming the staged tree into place is safe,
    // and the rename is atomic — a concurrent reader sees one tree or the
    // other, never a blend of the two.
    rmSync(buildDir, { recursive: true, force: true, },);
    renameSync(staging, buildDir,);
    removeStaleBuilds(dist, buildDir,);
    return buildDir;
  } finally {
    closeSync(lockFd,);
    unlinkSync(lockPath,);
  }
}
