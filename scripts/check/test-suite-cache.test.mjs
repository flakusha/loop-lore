// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the green-only test chunk cache (`test-suite-cache.mjs`),
 * driven as a subprocess. The passthrough command is a bash one-liner whose
 * observable effects are a sentinel append (proves the passthrough RAN) and
 * an lcov.info in the coverage dir (the artifact the cache stores). Each
 * case gets a fresh cache dir, so the key (which hashes the whole
 * test-relevant tree — identical within one test run) is fresh or absent
 * exactly as the case requires.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = new URL("./test-suite-cache.mjs", import.meta.url,).pathname;

const dirs = [];
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "suitescache-",),);
  dirs.push(dir,);
  return dir;
}
afterEach(() => {
  for (const dir of dirs) { rmSync(dir, { recursive: true, force: true, },); }
},);

function runWrapper({ cacheDir, covDir, passthrough, env = {}, },) {
  return Bun.spawnSync(
    [
      "bun",
      SCRIPT,
      "--suite=src",
      `--coverage-dir=${covDir}`,
      `--cache-dir=${cacheDir}`,
      "--",
      ...passthrough,
    ],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env, }, },
  );
}

const GREEN_LCOV = "SF:fake.ts\nDA:1,1\nLF:1\nLH:1\nend_of_record\n";

/** Passthrough that appends to a sentinel and writes a green lcov. */
function greenPassthrough(sentinel, covDir,) {
  return [
    "bash",
    "-c",
    `echo run >> ${sentinel}; mkdir -p ${covDir}; printf '${GREEN_LCOV.replace(/\n/g, "\\n",)}' > ${covDir}/lcov.info`,
  ];
}

/** Passthrough that exits 1 without writing any lcov. */
const RED_PASSTHROUGH = ["bash", "-c", "exit 1",];

describe("test-suite-cache", () => {
  test("miss runs the passthrough and caches the green chunk", () => {
    const dir = scratch();
    const sentinel = join(dir, "sentinel.log",);
    const cov = join(dir, "cov",);
    const cache = join(dir, "cache",);
    const r = runWrapper({ cacheDir: cache, covDir: cov, passthrough: greenPassthrough(sentinel, cov,), },);
    expect(r.exitCode,).toBe(0,);
    expect(readFileSync(sentinel, "utf8",).trim(),).toBe("run",);
    expect(r.stdout.toString(),).toContain("cache write",);
    const entries = readdirSync(cache,);
    expect(entries,).toHaveLength(1,);
    expect(entries[0],).toMatch(/^src-[0-9a-f]{24}$/,);
    expect(readFileSync(join(cache, entries[0], "lcov.info",), "utf8",),).toBe(GREEN_LCOV,);
    const meta = JSON.parse(readFileSync(join(cache, entries[0], "meta.json",), "utf8",),);
    expect(meta.suite,).toBe("src",);
  });

  test("hit replays the cached lcov and never reruns the passthrough", () => {
    const dir = scratch();
    const sentinel = join(dir, "sentinel.log",);
    const cov = join(dir, "cov",);
    const cache = join(dir, "cache",);
    const green = greenPassthrough(sentinel, cov,);
    expect(runWrapper({ cacheDir: cache, covDir: cov, passthrough: green, },).exitCode,).toBe(0,);
    expect(readFileSync(sentinel, "utf8",).trim(),).toBe("run",);
    // Second run with the SAME tree content: cache hit, passthrough skipped.
    rmSync(cov, { recursive: true, force: true, },);
    const r2 = runWrapper({ cacheDir: cache, covDir: cov, passthrough: green, },);
    expect(r2.exitCode,).toBe(0,);
    expect(r2.stdout.toString(),).toContain("cache hit",);
    expect(readFileSync(sentinel, "utf8",).trim(),).toBe("run",); // unchanged
    expect(readFileSync(join(cov, "lcov.info",), "utf8",),).toBe(GREEN_LCOV,);
  });

  test("a red run propagates the exit code and caches nothing", () => {
    const dir = scratch();
    const cov = join(dir, "cov",);
    const cache = join(dir, "cache",);
    const r = runWrapper({ cacheDir: cache, covDir: cov, passthrough: RED_PASSTHROUGH, },);
    expect(r.exitCode,).toBe(1,);
    expect(r.stderr.toString(),).toContain("cache: not written",);
    expect(existsSync(cache,),).toBe(false,);
  });

  test("CHECK_TEST_CACHE=0 disables all cache IO", () => {
    const dir = scratch();
    const sentinel = join(dir, "sentinel.log",);
    const cov = join(dir, "cov",);
    const cache = join(dir, "cache",);
    const green = greenPassthrough(sentinel, cov,);
    const r = runWrapper({
      cacheDir: cache,
      covDir: cov,
      passthrough: green,
      env: { CHECK_TEST_CACHE: "0", },
    },);
    expect(r.exitCode,).toBe(0,);
    expect(r.stdout.toString(),).not.toContain("cache",);
    expect(existsSync(cache,),).toBe(false,);
    // The passthrough still ran and the lcov still landed in the live dir.
    expect(readFileSync(join(cov, "lcov.info",), "utf8",),).toBe(GREEN_LCOV,);
  });

  test("a red run after a green run is NOT masked by the cache", () => {
    const dir = scratch();
    const cov = join(dir, "cov",);
    const cache = join(dir, "cache",);
    // Warm: green run with a lcov-writing passthrough.
    const covGreen = join(dir, "cov-green",);
    const sentinel = join(dir, "sentinel.log",);
    expect(
      runWrapper({ cacheDir: cache, covDir: covGreen, passthrough: greenPassthrough(sentinel, covGreen,), },).exitCode,
    ).toBe(0,);
    // The tree content is unchanged, so the SAME key would hit — but a red
    // passthrough must surface its red, never be answered from the cache.
    const r = runWrapper({ cacheDir: cache, covDir: cov, passthrough: RED_PASSTHROUGH, },);
    expect(r.exitCode,).toBe(1,);
    expect(r.stdout.toString(),).not.toContain("cache hit",);
  });
});
