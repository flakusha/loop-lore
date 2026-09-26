// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, } from "node:path";

// Resource contract: browser workers share one immutable dist/public build.
// The PID lock prevents concurrent rebuilds from exposing partial output.
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

/** @throws Propagates frontend build and lock filesystem failures. */
export function ensureFrontendBuild(): string {
  const root = join(import.meta.dir, "..", "..", "..",);
  const distPublic = join(root, "dist", "public",);
  const jsPath = join(distPublic, "alpine-init.js",);
  const hashPath = join(distPublic, ".build-hash",);
  const lockPath = join(distPublic, ".build-lock",);
  const expectedHash = hashFrontendSources(root,);
  const isReady = () =>
    existsSync(jsPath,) && existsSync(hashPath,) && readFileSync(hashPath, "utf8",) === expectedHash;

  mkdirSync(distPublic, { recursive: true, },);
  const lockFd = acquireBuildLock(lockPath, isReady,);
  if (lockFd === null) { return distPublic; }

  try {
    if (isReady()) { return distPublic; }
    const result = Bun.spawnSync(["bun", "run", "build:frontend",], {
      stdio: ["ignore", "pipe", "pipe",],
      cwd: root,
    },);
    if (result.exitCode !== 0) {
      throw new Error(`Frontend build failed: ${result.stderr.toString()}`,);
    }

    const srcViews = join(root, "src", "views",);
    const srcPublic = join(root, "src", "public",);
    if (existsSync(srcViews,)) { cpSync(srcViews, distPublic, { recursive: true, force: true, },); }
    if (existsSync(srcPublic,)) { cpSync(srcPublic, distPublic, { recursive: true, force: true, },); }
    writeFileSync(hashPath, expectedHash,);
    return distPublic;
  } finally {
    closeSync(lockFd,);
    unlinkSync(lockPath,);
  }
}
