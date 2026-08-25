// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared credential loader for worktree scripts
 *
 * Reads .credentials.env from the main repo root and exports agent identity.
 * Used by the TS dispatcher (import) and loadConfig (via findCredentials).
 */

import { accessSync, constants, readFileSync, } from "fs";
import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";

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

// Load synchronously at import time
// Primary: resolve from __dirname (scripts/worktree/utils/ → repo root)
// Fallback: git rev-parse --show-toplevel (handles worktree CWD, symlinks)
import { execSync, } from "child_process";

let repoRoot = resolve(__dirname, "..", "..", "..",);
try {
  const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8", cwd: repoRoot, timeout: 5000, },)
    .trim();
  if (gitRoot) { repoRoot = gitRoot; }
} catch {
  // git not available or not a git repo — use resolved path
}
const envPath = findCredentialsEnv(repoRoot,);

let credentials = { keyId: "", name: "", email: "", found: false, };

if (envPath) {
  try {
    const content = readFileSync(envPath, "utf-8",);
    credentials = parseCredentialsEnv(content,);
    credentials.path = envPath;
  } catch {
    // ignore read errors
  }
}

export { credentials, };

// When run directly (not imported), output shell-compatible KEY=value lines
if (process.argv[1] && process.argv[1].endsWith("credentials.mjs",)) {
  if (credentials.found) {
    console.log(`AGENT_GPG_KEY_ID='${credentials.keyId}'`,);
    console.log(`AGENT_GPG_NAME='${credentials.name}'`,);
    console.log(`AGENT_GPG_EMAIL='${credentials.email}'`,);
  }
}
