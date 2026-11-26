// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared utilities for external server management (llama.cpp, sd.cpp).
 *
 * Used by both the production ServerExternalManager and the e2e test helper.
 */

import { Glob, } from "bun";
import fs from "node:fs";
import { homedir as osHomedir, } from "node:os";
import { platform, } from "node:process";
import { safeFetch, } from "../utils";

// ── Binary discovery ──────────────────────────────────────

const WINDOWS_EXE_SUFFIX = ".exe";

/**
 * Absolute candidates outside PATH, searched after the PATH name. Order is
 * documented in `findBinary`: tilde paths expand via os.homedir() (never a
 * shell), globs are resolved and sorted deterministically.
 */
const BLENDER_ABSOLUTE_CANDIDATES = [
  "~/.local/bin/blender",
  "/opt/blender-bin-*/blender",
  "/opt/blender*/blender",
] as const;

export const BINARY_CANDIDATES = {
  "llama-cpp": ["llama-server", "llama-server-vk",],
  "llama-swap": ["llama-swap",],
  "sd-cpp": ["sd-server",],
  honkbox: ["honkbox",],
  blender: ["blender",],
  /** PATH names only — venv interpreters arrive via explicit `spec.venvPath`, never glob discovery. */
  python: ["python3",],
} as const;

/**
 * @param name
 */
function getBinaryNameWithSuffix(name: string,): string[] {
  const names = [name,];
  if (platform === "win32") {
    names.push(`${name}${WINDOWS_EXE_SUFFIX}`,);
  }

  return names;
}

export interface FindBinaryOptions {
  /** Injectable PATH lookup for tests. */
  which?: (name: string,) => string | null;
  /** Injectable homedir for tilde expansion in tests. */
  homedir?: () => string;
  /** Injectable glob matcher (pattern → matched absolute paths). */
  globSync?: (pattern: string,) => string[];
  /** Injectable existence check for literal absolute candidates. */
  exists?: (path: string,) => boolean;
}

/**
 * Resolve a binary for `type`. Candidate order for entries that mix PATH
 * names and absolute paths:
 *
 * 1. The PATH name (`which`), so an operator install on PATH wins.
 * 2. Literal tilde paths in listed order (`~` expands via os.homedir(),
 *    never a shell); taken when the expanded file exists.
 * 3. Glob candidates, deterministic per pattern: matches are sorted so
 *    versioned dirs like `/opt/blender-bin-4.9` sort DESCENDING — the
 *    highest version wins; non-versioned `/opt/blender*` globs sort
 *    ASCENDING and take the first (lexicographically smallest) match.
 */
export function findBinary(
  type: keyof typeof BINARY_CANDIDATES,
  options: FindBinaryOptions = {},
): string | null {
  const which = options.which ?? Bun.which;
  const homedir = options.homedir ?? osHomedir;
  const globSync = options.globSync ??
    ((pattern: string,) => Array.from(new Glob(pattern.slice(1,),).scanSync("/",), (p,) => `/${p}`,));

  const exists = options.exists ?? fs.existsSync;

  for (const candidate of BINARY_CANDIDATES[type]) {
    for (const actualName of getBinaryNameWithSuffix(candidate,)) {
      const result = which(actualName,);
      if (result) { return result; }
    }
  }

  if (type === "blender") {
    for (const candidate of BLENDER_ABSOLUTE_CANDIDATES) {
      for (const actualName of getBinaryNameWithSuffix(candidate,)) {
        if (actualName.startsWith("~",)) {
          const expanded = actualName.replace(/^~\/?/, `${homedir()}/`,);
          if (exists(expanded,)) { return expanded; }
          continue;
        }

        if (!actualName.includes("*",)) {
          if (exists(actualName,)) { return actualName; }
          continue;
        }

        const matches = globSync(actualName,);
        matches.sort(actualName.startsWith("/opt/blender-bin-",) ? compareDescending : undefined,);
        if (matches.length > 0) { return matches[0]!; }
      }
    }
  }

  return null;
}

/**
 * Sorts versioned absolute paths so the highest trailing version sorts
 * first (e.g. `/opt/blender-bin-4.9/blender` before `-4.5`). Version-less
 * names sort after versioned ones, lexicographically descending.
 */
function compareDescending(a: string, b: string,): number {
  const va = extractVersion(a,), vb = extractVersion(b,);
  if (va !== null && vb !== null) {
    if (va !== vb) { return compareVersionParts(vb, va,); }
    return b.localeCompare(a,);
  }

  if (va !== null) { return -1; }
  if (vb !== null) { return 1; }
  return b.localeCompare(a,);
}

function extractVersion(path: string,): string | null {
  const match = /(\d+(?:\.\d+)*)\/[^/]*$/.exec(path,);
  return match?.[1] ?? null;
}

function compareVersionParts(a: string, b: string,): number {
  const pa = a.split(".",).map(Number,), pb = b.split(".",).map(Number,);
  for (let i = 0; i < Math.max(pa.length, pb.length,); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) { return d; }
  }

  return 0;
}

// ── Port verification ─────────────────────────────────────

/**
 * Best-effort snapshot: does `port` look free *right now*?
 *
 * Bind-then-release is inherently racy (TOCTOU) — another process may grab
 * the port between this check and the later spawn. Callers use it as a fast
 * pre-spawn skip; a busy port can still surface later as a failed readiness
 * wait at spawn.
 * @param port
 * @returns {boolean}
 */
export function isPortFree(port: number,): boolean {
  try {
    const server = Bun.serve({ port, fetch: () => new Response("ok",), },);
    void (async () => {
      try {
        await server.stop();
      } catch {
        /* probe port check — ignore */
      }
    })();

    return true;
  } catch {
    return false;
  }
}

// ── Health check option types ─────────────────────────────

/** */
export interface WaitForHealthOptions {
  timeoutMs: number;
  intervalMs?: number;
}

/** */
export interface WaitForPortOptions {
  timeoutMs: number;
}

// ── Health checks ─────────────────────────────────────────

/**
 * @param url
 * @param opts
 * @returns {Promise<boolean>}
 */
export async function waitForHealth(url: string, opts: WaitForHealthOptions,): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    // Readiness = any 2xx response; body may be empty/text, not JSON.
    const result = await safeFetch<string>(url, { timeout: 2_000, parseJson: false, },);
    if (result.ok) { return true; }
    await new Promise((r,) => setTimeout(r, intervalMs,));
  }

  return false;
}

/**
 * @param port
 * @param opts
 * @returns {Promise<boolean>}
 */
export async function waitForPort(port: number, opts: WaitForPortOptions,): Promise<boolean> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const result = await safeFetch(`http://127.0.0.1:${port}/`, { timeout: 2_000, },);
    // Any HTTP response (any status) means the port is serving.
    if (result.ok || result.status !== undefined) { return true; }
    await new Promise((r,) => setTimeout(r, 500,));
  }

  return false;
}

/**
 * @param path
 * @returns {boolean}
 */
export function isHuggingFaceRef(path: string,): boolean {
  return /^[\w-]+\/[\w.-]+:\w+$/i.test(path,);
}
