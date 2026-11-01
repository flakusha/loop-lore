#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 230

/**
 * Green-only content-hash cache for the test chunk gates.
 *
 * The chunk gates (`tests - unit (src)`, `tests - e2e (inproc)`,
 * `tests - plugins`) each run `bun test --coverage` and cost minutes. On a
 * rerun where NOTHING test-relevant changed (a docs/plan-only diff running
 * the full check, a rerun after a non-test gate failed), the previous run's
 * lcov chunk is exactly as good as a fresh one — so this wrapper keys the
 * suite's inputs by content hash and replays the cached lcov on a hit.
 *
 * Safety contract:
 *   - Only PASSING runs are cached. A red run writes no entry, so a cached
 *     replay can only ever reproduce a previously-observed green. Flaky
 *     reds are never frozen into the cache.
 *   - The key covers every input the suite can observe: the content of all
 *     files under src/ plugins/ scripts/ tests/ packages/ native/ (real
 *     module bodies live under packages/core since the monorepo split — the
 *     src/ copies are shims that re-export them, so hashing src/ alone
 *     would miss core edits), root configs (package.json, bun.lock,
 *     bunfig.toml, tsconfig*.json), .credentials.env, the bun version, and
 *     the exact passthrough argv (file list + flags).
 *   - The native tree is hashed EXCLUDING native/target: a cargo rebuild
 *     with unchanged sources is invisible to the key, which is the correct
 *     direction (same sources => same tests). Sources changing invalidates.
 *   - CHECK_TEST_CACHE=0 disables the cache entirely (straight passthrough).
 *
 * Usage (built by `gates.mjs`, not typed by hand):
 *   bun run scripts/check/test-suite-cache.mjs --suite src \
 *     --coverage-dir .tmp/run-<id>/coverage-src -- \
 *     bun test --parallel=12 <files...> --isolate --coverage ... \
 *     --coverage-dir=.tmp/run-<id>/coverage-src
 */
import { createHash, } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..", "..",);

// ── argv: known flags, then `--` and the passthrough command ──
const argv = process.argv.slice(2,);
const sep = argv.indexOf("--",);
if (sep === -1) {
  console.error("error: test-suite-cache requires `-- <bun test ...>` passthrough",);
  process.exit(2,);
}
const passthrough = argv.slice(sep + 1,);
if (passthrough.length === 0) {
  console.error("error: empty passthrough after --",);
  process.exit(2,);
}
const known = new Map();
for (let i = 0; i < sep;) {
  const a = argv[i];
  if (a === "--suite" || a === "--coverage-dir" || a === "--cache-dir") {
    known.set(a, argv[i + 1],);
    i += 2;
    continue;
  }
  if (a.startsWith("--suite=",) || a.startsWith("--coverage-dir=",) || a.startsWith("--cache-dir=",)) {
    const [k, v,] = a.split("=",);
    known.set(`--${k.slice(2,)}`, v,);
    i += 1;
    continue;
  }
  console.error(`error: unknown test-suite-cache flag ${a}`,);
  process.exit(2,);
}
const suite = known.get("--suite",);
const coverageDir = known.get("--coverage-dir",);
const cacheDir = known.get("--cache-dir",) ?? ".tmp/lane-cache";
if (!suite || !coverageDir) {
  console.error("error: --suite and --coverage-dir are required",);
  process.exit(2,);
}

// ── content scan ────────────────────────────────────────────────
const SKIP_DIRS = new Set([".tmp", "node_modules", "target", "dist", ".git",],);
const SCAN_DIRS = ["src", "plugins", "scripts", "tests", "packages", "native",];
const ROOT_FILES = [
  "package.json",
  "bun.lock",
  "bunfig.toml",
  ".credentials.env",
  "tsconfig.json",
  "tsconfig.backend.json",
  "tsconfig.frontend.json",
  "tsconfig.scripts.json",
];

function hashFile(hasher, abs, rel,) {
  const st = statSync(abs,);
  if (!st.isFile()) { return; }
  // Path + size + mtime are NOT enough — content is the contract.
  hasher.update(rel,);
  hasher.update("\0",);
  hasher.update(readFileSync(abs,),);
  hasher.update("\0",);
}

function walkHash(hasher, dir,) {
  const absDir = path.resolve(PROJECT_ROOT, dir,);
  if (!existsSync(absDir,)) { return; }
  const stack = [absDir,];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true, },);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name,);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name,)) { continue; }
        stack.push(full,);
        continue;
      }
      if (entry.isFile()) {
        hashFile(hasher, full, path.relative(PROJECT_ROOT, full,),);
      }
    }
  }
}

/**
 * The cache key: bun version + hashed tree contents + root configs + the
 * exact passthrough argv. Suite name is deliberately NOT in the key — one
 * key per tree state, per-suite entries beneath it — so any input change
 * invalidates every suite's chunk at once (correct, if occasionally
 * conservative: an src/ edit also invalidates the e2e chunk).
 */
function computeKey() {
  const hasher = createHash("sha256",);
  hasher.update(`bun=${Bun.version}\n`,);
  hasher.update(`argv=${JSON.stringify(passthrough,)}\n`,);
  for (const dir of SCAN_DIRS) { walkHash(hasher, dir,); }
  for (const f of ROOT_FILES) {
    const abs = path.resolve(PROJECT_ROOT, f,);
    if (existsSync(abs,)) { hashFile(hasher, abs, f,); }
  }
  return hasher.digest("hex",).slice(0, 24,);
}

// A symlink/permission hiccup must not crash the run: the cache is an
// optimization, so key computation falls back to uncached on any error.
function keyOrDisabled() {
  try {
    return computeKey();
  } catch (error) {
    console.error(`test-suite-cache: key computation failed (${error.message}); running uncached`,);
    return null;
  }
}

const key = process.env.CHECK_TEST_CACHE === "0" ? null : keyOrDisabled();
const entryDir = key === null ? null : path.resolve(PROJECT_ROOT, cacheDir, `${suite}-${key}`,);
const entryLcov = entryDir === null ? null : path.join(entryDir, "lcov.info",);

if (entryLcov !== null && existsSync(entryLcov,)) {
  // Hit: replay the cached green chunk into this run's coverage dir.
  mkdirSync(path.resolve(PROJECT_ROOT, coverageDir,), { recursive: true, },);
  cpSync(entryLcov, path.resolve(PROJECT_ROOT, coverageDir, "lcov.info",),);
  console.log(`[tests - ${suite}] cache hit (${key}) — replayed lcov from ${entryLcov}`,);
  process.exit(0,);
}

const proc = Bun.spawn(passthrough, {
  cwd: PROJECT_ROOT,
  stdio: ["inherit", "inherit", "inherit",],
},);
const rc = await proc.exited;
if (rc !== 0) {
  if (entryDir !== null) {
    console.error(`[tests - ${suite}] cache: not written (gate exited ${rc})`,);
  }
  process.exit(rc,);
}
const liveLcov = path.resolve(PROJECT_ROOT, coverageDir, "lcov.info",);
if (entryDir !== null && existsSync(liveLcov,)) {
  // Publish atomically: stage in a temp dir, rename into place. A concurrent
  // same-key writer losing the rename race is harmless (both are greens of
  // the same inputs).
  const stage = `${entryDir}.tmp-${process.pid}`;
  try {
    rmSync(stage, { recursive: true, force: true, },);
    mkdirSync(stage, { recursive: true, },);
    cpSync(liveLcov, path.join(stage, "lcov.info",),);
    writeFileSync(
      path.join(stage, "meta.json",),
      `${
        JSON.stringify(
          {
            suite,
            key,
            bun: Bun.version,
            argv: passthrough,
            cachedAt: new Date().toISOString(),
          },
          null,
          2,
        )
      }\n`,
    );
    renameSync(stage, entryDir,);
    console.log(`[tests - ${suite}] cache write (${key})`,);
  } catch (error) {
    try {
      rmSync(stage, { recursive: true, force: true, },);
    } catch { /* best effort */ }
    console.error(`[tests - ${suite}] cache write skipped (${error.message})`,);
  }
}
process.exit(0,);
