// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Process-local git context for the exec log (branch, sha, pid).
 *
 * Branch and sha are read once per process and cached: they cannot change
 * without the working tree changing, and a per-call `git rev-parse` would add
 * two subprocess spawns to every LLM dispatch. Both are advisory provenance on
 * a best-effort log, so a failed lookup yields null and never throws.
 *
 * ponytail: cache is never invalidated mid-process. A long-lived dev server
 * that switches branches keeps logging the boot branch; re-read on a `git
 * index` mtime watch if that provenance ever needs to be exact.
 */
import { execFileSync, } from "node:child_process";
import { randomUUID, } from "node:crypto";
import { devNull, } from "node:os";

/**
 * Deterministic environment for the read-only git metadata calls below.
 *
 * Host config is dropped (aliases, credential helpers, hooksPath, gpg settings)
 * as are the `GIT_*` vars that redirect git to a different repo or config
 * layer — an inherited `GIT_DIR` would otherwise defeat an explicit `cwd`.
 * Optional locks are off so a lookup never refreshes the index, and prompts
 * are off so a failed lookup can never block on a terminal.
 */
const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_COMMON_DIR: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
  GIT_CONFIG_COUNT: "0",
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
};

/** Cached `git rev-parse` output; null until first use, then the two values. */
let cached: { branch: string | null; gitSha: string | null } | null = null;

/**
 * Run a `git` subcommand for exec-log metadata, with stderr discarded so a
 * failure can never scribble on the caller's console.
 * @param args - the git subcommand and its flags
 * @param cwd - directory to run git in; defaults to the process cwd
 * @returns trimmed stdout.
 * @throws the underlying exec error when git fails or times out.
 */
export function runGit(args: string[], cwd?: string,): string {
  return execFileSync("git", args, {
    cwd,
    env: GIT_ENV,
    encoding: "utf8",
    timeout: 5_000,
    stdio: ["ignore", "pipe", "ignore",],
  },).trim();
}

/**
 * Read branch + sha via two `git` calls: `symbolic-ref --short HEAD` for the
 * branch, `rev-parse --short HEAD` for the sha.
 *
 * They cannot share one invocation: `--abbrev-ref` is a mode flag that applies
 * to every later revision on the same command line, so
 * `rev-parse --abbrev-ref HEAD --short HEAD` prints the branch twice.
 *
 * `symbolic-ref` also exits non-zero on a detached HEAD — the honest signal
 * that there is no branch, so no `"HEAD"` sentinel is needed.
 * @returns Branch and short sha; nulls outside a checkout or on a detached HEAD.
 */
function readGitContext(): { branch: string | null; gitSha: string | null } {
  let branch: string | null = null;
  try {
    branch = runGit(["symbolic-ref", "--short", "HEAD",],) || null;
  } catch {
    branch = null;
  }

  let gitSha: string | null = null;
  try {
    gitSha = runGit(["rev-parse", "--short", "HEAD",],) || null;
  } catch {
    gitSha = null;
  }

  return { branch, gitSha, };
}

/**
 * Current branch and commit for the exec log. Memoized per process.
 * @returns Branch + short sha; nulls when git is unavailable.
 */
export function getGitContext(): { branch: string | null; gitSha: string | null } {
  if (cached === null) { cached = readGitContext(); }
  return cached;
}

/** Drop the cached git context. Test-only seam. */
export function resetGitContext(): void {
  cached = null;
}

/**
 * Fresh run id. A UUIDv4 is unique across concurrent processes writing the
 * same log, which a timestamp+pid pair is not (pid reuse across restarts).
 * @returns A new run id.
 */
export function newRunId(): string {
  return randomUUID();
}

/** The pid of this process, recorded for cross-referencing a log line. */
export const LOG_PID: number = process.pid;
