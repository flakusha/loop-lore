// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared credential loader for worktree scripts.
 *
 * Resolves agent GPG identity from one of three sources, in priority order:
 *   1. `.credentials.env` walked up from the script's `__dirname`.
 *      Source of truth when present; carries the canonical agent identity.
 *   2. git config (`user.signingkey`, `user.name`, `user.email`) read from
 *      the script's resolved repoRoot via `git -C <repoRoot> config`.
 *      Used when a worktree was created without `scripts/worktree/ new`
 *      and therefore lacks the `.credentials.env` symlink — the git repo's
 *      own signing config still works.
 *   3. Hard fail (only when both 1 and 2 produce an incomplete identity).
 *
 * Used by the TS dispatcher (import) and loadConfig (via findCredentials).
 */

import { execSync, } from "node:child_process";
import { accessSync, constants, readFileSync, } from "node:fs";
import { dirname, resolve, } from "node:path";
import { fileURLToPath, } from "node:url";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

/**
 * Walk up directory tree to find .credentials.env
 */
function findCredentialsEnv(startDir,) {
  let dir = startDir;
  while (dir !== "/") {
    const candidate = resolve(dir, ".credentials.env",);
    try {
      accessSync(candidate, constants.R_OK,);
      return candidate;
    } catch {
      // not found, keep walking
    }
    dir = dirname(dir,);
  }
  return null;
}

/**
 * Parse KEY=VALUE lines from .credentials.env
 */
function parseCredentialsEnv(content,) {
  const result = { keyId: "", name: "", email: "", found: false, };
  for (const line of content.split("\n",)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#",)) { continue; }
    const eqIdx = trimmed.indexOf("=",);
    if (eqIdx === -1) { continue; }
    const key = trimmed.slice(0, eqIdx,).trim();
    const value = trimmed.slice(eqIdx + 1,).trim().replace(/^["']|["']$/g, "",);
    if (key === "AGENT_GPG_KEY_ID") { result.keyId = value; }
    else if (key === "AGENT_GPG_NAME") { result.name = value; }
    else if (key === "AGENT_GPG_EMAIL") { result.email = value; }
  }
  if (result.keyId && result.name && result.email) {
    result.found = true;
  }
  return result;
}

/**
 * Read a single git config key from `cwd` via `git -C <cwd> config --get <key>`.
 * Returns empty string when unset or git errors out.
 */
function readGitConfig(cwd, key,) {
  try {
    return execSync(`git -C "${cwd}" config --get ${key}`, { encoding: "utf-8", timeout: 5000, },)
      .trim();
  } catch {
    return "";
  }
}

// Load synchronously at import time.
// Primary: resolve from __dirname (scripts/worktree/utils/ → repo root).
// The git-rev-parse probe that used to live here was removed: it overrode
// repoRoot with the worktree path when invoked from a worktree, which
// defeated the parent-walk to the main repo's `.credentials.env`. Resolving
// from __dirname is enough — see worktree-investigate-gpg-unlock-ergonomics
// for the audit history.
const repoRoot = resolve(__dirname, "..", "..", "..",);
const envPath = findCredentialsEnv(repoRoot,);

let credentials = { keyId: "", name: "", email: "", found: false, source: "", };

if (envPath) {
  try {
    const content = readFileSync(envPath, "utf-8",);
    const parsed = parseCredentialsEnv(content,);
    credentials = { ...parsed, path: envPath, source: "env", };
  } catch {
    // ignore read errors — fall through to git-config fallback
  }
}

// Fallback: git config in the same repoRoot. Covers worktrees created
// without `scripts/worktree/ new` (no `.credentials.env` symlink) and any
// other case where the env file is missing or incomplete.
if (!credentials.found) {
  const keyId = readGitConfig(repoRoot, "user.signingkey",);
  const name = readGitConfig(repoRoot, "user.name",);
  const email = readGitConfig(repoRoot, "user.email",);
  if (keyId && name && email) {
    credentials = {
      keyId,
      name,
      email,
      found: true,
      source: "git-config",
      path: resolve(repoRoot, ".git", "config",),
    };
  }
}

export { credentials, };

// When run directly (not imported), output shell-compatible KEY=value lines.
// Source label is prefixed to stderr so callers can tell which lookup
// succeeded when troubleshooting.
if (process.argv[1] && process.argv[1].endsWith("credentials.mjs",)) {
  if (credentials.found) {
    process.stderr.write(`source: ${credentials.source}\n`,);
    console.log(`AGENT_GPG_KEY_ID='${credentials.keyId}'`,);
    console.log(`AGENT_GPG_NAME='${credentials.name}'`,);
    console.log(`AGENT_GPG_EMAIL='${credentials.email}'`,);
  }
}
