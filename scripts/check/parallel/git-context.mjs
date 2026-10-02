// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Git context snapshot for the parallel check runner: the resolved git
 * binary, a quiet query helper, and the branch/head/dirty provenance captured
 * once at module init and embedded in every report.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { execFileSync, } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import { PROJECT_ROOT, } from "./config.mjs";

// Resolve the git binary once: fixed path satisfies
// sonarjs/no-os-command-from-path and avoids PATH-order surprises.
export const GIT_BIN = (() => {
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter,);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, "git",);
    if (existsSync(candidate,)) { return candidate; }
  }
  return "git";
})();

/**
 * Run a git query synchronously; returns "" when git is unavailable.
 */
function gitSync(args,) {
  try {
    return execFileSync(GIT_BIN, args, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore",], },)
      .trim();
  } catch {
    return "";
  }
}

/**
 * Snapshot of the tree this run happens in: branch, head commit, dirtiness.
 */
function getGitContext() {
  const branch = gitSync(["branch", "--show-current",],) ||
    gitSync(["symbolic-ref", "--short", "HEAD",],) ||
    "(detached)";
  const gitHead = gitSync(["rev-parse", "--short", "HEAD",],);
  const status = gitSync(["status", "--porcelain",],);
  return {
    branch,
    gitHead,
    // Git unavailable → head is "" anyway; stale checks fall back to gitHead.
    gitDirty: status.length > 0,
  };
}

export const GIT_CONTEXT = getGitContext();
