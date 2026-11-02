// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { openSync, readFileSync, unlinkSync, writeSync, } from "node:fs";

function processIsRunning(pid: number,): boolean {
  try {
    process.kill(pid, 0,);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Exclusive build lock with stale-PID takeover. Creates `lockPath` (`wx`) and
 * returns its fd while the caller holds the lock; `null` once `isReady()` is
 * true (someone else finished the work). A lock whose owning PID is gone is
 * stolen so a killed worker cannot wedge the build forever.
 *
 * @throws Non-EEXIST filesystem errors on lock creation/read.
 */
export function acquireBuildLock(lockPath: string, isReady: () => boolean,): number | null {
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
