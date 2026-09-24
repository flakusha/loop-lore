// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 280

/**
 * Build identity hash — tamper-detection surface for federation.
 *
 * Produces a deterministic SHA-256 fingerprint over the running server's code
 * (git HEAD, source-tree hash, lockfile hash, build manifest) so a peer can
 * verify a remote instance is running unmodified upstream bytes before
 * federating. Mirrors the searxng commit-pin approach.
 *
 * Layers (concatenated in fixed order, then sha256'd):
 *   - gitHead        : `git rev-parse HEAD` (or empty string if unavailable)
 *   - sourceTreeHash : sha256 over (relPath + sha256(contents)) pairs
 *   - lockfileHash   : sha256(package.json + bun.lock + bunfig.toml)
 *   - manifestHash   : sha256(BUILD_MANIFEST JSON: bunVersion/platform/arch/buildProfile)
 *
 * Memoized per projectRoot; cleared by `__resetBuildIdentityForTests`.
 */

import { spawnSync, } from "node:child_process";
import type { Dirent, } from "node:fs";
import { existsSync, readFileSync, statSync, } from "node:fs";
import { readdir, } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, } from "node:url";
import { APP_NAME, APP_VERSION, } from "../config/constants";
import { safeJsonStringify, } from "../utils";

/**
 * Project root resolved from this module's URL. Used as the default for
 * `computeBuildIdentity` so the hash is stable regardless of the working
 * directory the server was launched from. Walked up two levels from this
 * file (`src/build/identity.ts` → repo root).
 */
const PROJECT_ROOT_FROM_META = (() => {
  try {
    const here = fileURLToPath(import.meta.url,);
    return path.resolve(path.dirname(here,), "..", "..",);
  } catch {
    return null;
  }
})();

/**
 * Build manifest surfaced for diagnostics + the verify script. Order-stable
 * JSON so the hash is reproducible regardless of object key insertion order.
 */
export interface BuildManifest {
  bunVersion: string;
  platform: string;
  arch: string;
  buildProfile: "development" | "production";
  appName: string;
  appVersion: string;
}

/** Full breakdown returned by `computeBuildIdentity`. */
export interface BuildIdentity {
  /** Final fingerprint — sha256 hex over the four layers. */
  buildHash: string;
  /** First 16 hex chars of buildHash for compact inclusion in instance-state. */
  buildHashShort: string;
  gitHead: string;
  sourceTreeHash: string;
  lockfileHash: string;
  manifestHash: string;
  /** ISO timestamp captured at compute time. */
  builtAt: string;
  /** Echo of the manifest for diagnostics. */
  manifest: BuildManifest;
}

/** Static exclusion list for the source-tree hash. */
const SOURCE_EXCLUDE_DIRS: Record<string, true> = {
  node_modules: true,
  ".git": true,
  ".tmp": true,
  dist: true,
  worktree: true,
};

/**
 * Read git HEAD without throwing if git is missing or the dir isn't a repo.
 * Returns "" on failure (caller treats as missing layer).
 * @param projectRoot - repo root to read from
 * @returns git HEAD sha, or "" on any failure
 */
function readGitHead(projectRoot: string,): string {
  try {
    const res = spawnSync("git", ["rev-parse", "HEAD",], {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 5_000,
    },);
    if (res.status !== 0) { return ""; }
    const head = (res.stdout ?? "").trim();
    return /^[0-9a-f]{4,}$/i.test(head,) ? head : "";
  } catch {
    return "";
  }
}

/**
 * SHA-256 of a UTF-8 string, returned as hex.
 * @param data - bytes or string to hash
 * @returns 64-char lowercase hex sha-256
 */
function sha256Hex(data: string | Uint8Array,): string {
  const hasher = new Bun.CryptoHasher("sha256",);
  hasher.update(data,);
  return hasher.digest("hex",);
}

/**
 * Stable JSON for a manifest object (sorted keys).
 * @param value - manifest object to serialize
 * @returns deterministic JSON string with sorted object keys
 * @throws {Error} when serialization fails
 */
function stableJson(value: unknown,): string {
  const seen = new WeakSet<object>();
  const walk = (node: unknown,): unknown => {
    if (node === null || typeof node !== "object") { return node; }
    if (seen.has(node as object,)) { return null; }
    seen.add(node as object,);
    if (Array.isArray(node,)) { return node.map(walk,); }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(node as object,).sort()) {
      out[k] = walk((node as Record<string, unknown>)[k],);
    }
    return out;
  };
  const result = safeJsonStringify(walk(value,),);
  if (!result.ok) {
    throw new Error(`stableJson failed: ${result.error.message}`,);
  }
  return result.value;
}

/**
 * Recursively collect file paths under `root`, excluding the configured
 * ignore set. Deterministic order so the resulting hash is stable.
 * @param root - directory to walk
 * @param excludeDirs - directory names to skip (static lookup)
 * @param out - accumulator (defaults to a fresh array)
 * @returns sorted absolute file paths under root
 */
async function walkFiles(
  root: string,
  excludeDirs: Record<string, true>,
  out: string[] = [],
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true, },);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name,);
    if (entry.isDirectory()) {
      if (excludeDirs[entry.name]) { continue; }
      await walkFiles(full, excludeDirs, out,);
    } else if (entry.isFile()) {
      out.push(full,);
    }
  }
  out.sort();
  return out;
}

/**
 * Hash the project's source tree — every file under `projectRoot` except
 * the excluded dirs. Returns sha256 over the concatenated
 * `relative_path\0sha256(contents)\0` pairs. Files that can't be read are
 * skipped (best-effort).
 * @param projectRoot - project root to hash under
 * @returns sha-256 hex of the source tree
 */
async function hashSourceTree(projectRoot: string,): Promise<string> {
  const files = await walkFiles(projectRoot, SOURCE_EXCLUDE_DIRS,);
  const hasher = new Bun.CryptoHasher("sha256",);
  for (const absPath of files) {
    const rel = path.relative(projectRoot, absPath,);
    let bytes: Uint8Array;
    try {
      const st = statSync(absPath,);
      if (!st.isFile()) { continue; }
      bytes = readFileSync(absPath,);
    } catch {
      continue;
    }
    const inner = sha256Hex(bytes,);
    hasher.update(`${rel}\0${inner}\0`,);
  }
  return hasher.digest("hex",);
}

/**
 * Hash the lockfile surface — package.json + bun.lock + bunfig.toml.
 * Returns "" if none of the three exist (caller treats as missing layer).
 * @param projectRoot - project root to hash under
 * @returns sha-256 hex of the concatenated lockfile surface, or ""
 */
function hashLockfiles(projectRoot: string,): string {
  const parts: string[] = [];
  for (const name of ["package.json", "bun.lock", "bunfig.toml",]) {
    const abs = path.join(projectRoot, name,);
    if (!existsSync(abs,)) { continue; }
    try {
      parts.push(`${name}\0${readFileSync(abs, "utf8",)}`,);
    } catch {
      // skip unreadable file
    }
  }
  if (parts.length === 0) { return ""; }
  return sha256Hex(parts.join("\n",),);
}

/**
 * Build the manifest — fixed-shape JSON of runtime identity. The stringified
 * manifest is itself hashed and contributed to the final build hash, so any
 * drift in bunVersion/platform/arch produces a different buildHash.
 * @param projectRoot - reserved for future per-project manifest overrides
 * @returns BuildManifest describing the runtime build
 */
function buildManifest(projectRoot: string,): BuildManifest {
  void projectRoot;
  const profile: BuildManifest["buildProfile"] = process.env.NODE_ENV === "production"
    ? "production"
    : "development";
  const bunVersion = (globalThis as { Bun?: { version?: string } }).Bun?.version ?? "";
  return {
    bunVersion,
    platform: process.platform,
    arch: process.arch,
    buildProfile: profile,
    appName: APP_NAME,
    appVersion: APP_VERSION,
  };
}

const memo = new Map<string, BuildIdentity>();

/**
 * Compute (and cache) the build identity for `projectRoot`. The cache key
 * is the resolved projectRoot path; subsequent calls return the same object
 * for the lifetime of the process. Tests call `__resetBuildIdentityForTests`
 * to clear it.
 *
 * @param options - `projectRoot` defaults to the module's resolved project
 *   root (so the hash is stable regardless of cwd); `force` bypasses cache.
 * @param options.projectRoot - project root to hash under
 * @param options.force - bypass the memoization cache
 * @returns full BuildIdentity breakdown for the projectRoot
 */
export async function computeBuildIdentity(
  options: { projectRoot?: string; force?: boolean } = {},
): Promise<BuildIdentity> {
  const projectRoot = path.resolve(
    options.projectRoot ?? PROJECT_ROOT_FROM_META ?? process.cwd(),
  );
  const cached = memo.get(projectRoot,);
  if (cached && !options.force) { return cached; }

  const gitHead = readGitHead(projectRoot,);
  const sourceTreeHash = await hashSourceTree(projectRoot,);
  const lockfileHash = hashLockfiles(projectRoot,);
  const manifest = buildManifest(projectRoot,);
  const manifestJson = stableJson(manifest,);
  const manifestHash = sha256Hex(manifestJson,);

  const buildHash = sha256Hex(
    [gitHead, sourceTreeHash, lockfileHash, manifestHash,].join("\0",),
  );

  const identity: BuildIdentity = {
    buildHash,
    buildHashShort: buildHash.slice(0, 16,),
    gitHead,
    sourceTreeHash,
    lockfileHash,
    manifestHash,
    builtAt: new Date().toISOString(),
    manifest,
  };

  memo.set(projectRoot, identity,);
  return identity;
}

/** Clear the in-process memo. Test-only — production callers should never invoke this. */
export function __resetBuildIdentityForTests(): void {
  memo.clear();
}
