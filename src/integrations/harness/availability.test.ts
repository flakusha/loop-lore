// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * availability.ts tests: PATH resolution, version collection, fail-soft
 * spawn mapping, caching, and the refresh/reset seams.
 *
 * Resource contract (parallel-safe): every test owns a fresh mkdtemp
 * directory holding its fixture scripts (a stray `sleep 5` child is killed
 * by the probe's own timeout; leftover dirs are removed in afterEach); the
 * PATH scope is passed per call via `envPath` — `process.env.PATH` is never
 * mutated; the verdict cache is cleared in afterEach via the reset seam, so
 * tests pass alone or in any order. No ports, no fixed paths.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import {
  __resetHarnessAvailabilityCache,
  probeHarnessCommand,
} from "./availability";

/** Scratch parent under the repo's .tmp/ (same convention as the route tests). */
const TMP_ROOT = ".tmp/harness-availability";

/** A command name that cannot exist on any development machine. */
const MISSING = "loop-lore-no-such-binary";

/** Directories created by the current test; removed after each. */
let dirs: string[] = [];

/** Create a fresh per-test fixture directory (prefix form: parent must exist). */
function makeDir(): string {
  mkdirSync(TMP_ROOT, { recursive: true, },);
  const dir = mkdtempSync(join(TMP_ROOT, "probe-",),);
  dirs.push(dir,);
  return dir;
}

/** Write an executable fixture script into `dir` and return its path. */
function writeScript(dir: string, name: string, body: string, mode = 0o755,): string {
  const path = join(dir, name,);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode, },);
  return path;
}

/** Count the marker lines the invocation-counting fixture accumulated. */
function invocationCount(dir: string,): number {
  const marker = join(dir, "counter",);
  try {
    return readFileSync(marker, "utf8",).split("\n",).filter((line,) => line.length > 0).length;
  } catch {
    return 0;
  }
}

afterEach(() => {
  __resetHarnessAvailabilityCache();
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) { rmSync(dir, { recursive: true, force: true, },); }
  }
},);

describe("probeHarnessCommand", () => {
  it("reports the version when the binary is on the probed PATH", async () => {
    const dir = makeDir();
    writeScript(dir, "fake-harness", `echo "fake-harness 1.2.3"`,);

    const verdict = await probeHarnessCommand({ command: ["fake-harness", "acp",], envPath: dir, },);

    expect(verdict,).toEqual({ available: true, version: "fake-harness 1.2.3", },);
  });

  it("resolves a direct-path command without consulting PATH", async () => {
    const dir = makeDir();
    const script = writeScript(dir, "direct-harness", `echo "direct 2.0"`,);

    const verdict = await probeHarnessCommand({ command: [script,], envPath: "", },);

    expect(verdict,).toEqual({ available: true, version: "direct 2.0", },);
  });

  it("reports unavailable with a reason when the binary is absent", async () => {
    const dir = makeDir();

    const verdict = await probeHarnessCommand({ command: [MISSING, "acp",], envPath: dir, },);

    expect(verdict.available,).toBe(false,);
    if (verdict.available) { throw new Error("unreachable",); }
    expect(verdict.reason,).toContain(MISSING,);
  });

  it("maps a found-but-not-executable file to a spawn-failure reason", async () => {
    const dir = makeDir();
    writeScript(dir, "dull-harness", `echo "never runs"`, 0o644,);

    const verdict = await probeHarnessCommand({ command: ["dull-harness",], envPath: dir, },);

    expect(verdict.available,).toBe(false,);
    if (verdict.available) { throw new Error("unreachable",); }
    expect(verdict.reason,).toContain("spawn failed",);
  });

  it("a hanging --version is killed at the timeout and still reads available", async () => {
    const dir = makeDir();
    writeScript(dir, "slow-harness", `sleep 30`,);

    const verdict = await probeHarnessCommand({
      command: ["slow-harness",],
      envPath: dir,
      timeoutMs: 150,
    },);

    expect(verdict,).toEqual({ available: true, version: null, },);
  });

  it("a nonzero --version exit reads available without a version", async () => {
    const dir = makeDir();
    writeScript(dir, "broken-harness", `echo broken >&2; exit 3`,);

    const verdict = await probeHarnessCommand({ command: ["broken-harness",], envPath: dir, },);

    expect(verdict,).toEqual({ available: true, version: null, },);
  });

  it("empty --version output reads available with a null version", async () => {
    const dir = makeDir();
    writeScript(dir, "quiet-harness", `exit 0`,);

    const verdict = await probeHarnessCommand({ command: ["quiet-harness",], envPath: dir, },);

    expect(verdict,).toEqual({ available: true, version: null, },);
  });

  it("an empty command reads unavailable", async () => {
    const verdict = await probeHarnessCommand({ command: [], envPath: "", },);

    expect(verdict.available,).toBe(false,);
  });

  it("caches the verdict across calls (the binary executes once)", async () => {
    const dir = makeDir();
    // The fixture appends a marker line on every real execution.
    writeScript(dir, "counted-harness", `echo run >> "$(dirname "$0")/counter"`,);

    const first = await probeHarnessCommand({ command: ["counted-harness",], envPath: dir, },);
    const second = await probeHarnessCommand({ command: ["counted-harness",], envPath: dir, },);

    expect(first,).toEqual(second,);
    expect(invocationCount(dir,),).toBe(1,);
  });

  it("refresh bypasses the cache and re-executes the binary", async () => {
    const dir = makeDir();
    writeScript(dir, "counted-harness", `echo run >> "$(dirname "$0")/counter"`,);

    await probeHarnessCommand({ command: ["counted-harness",], envPath: dir, },);
    await probeHarnessCommand({ command: ["counted-harness",], envPath: dir, refresh: true, },);

    expect(invocationCount(dir,),).toBe(2,);
  });

  it("the reset seam clears the cache", async () => {
    const dir = makeDir();
    writeScript(dir, "counted-harness", `echo run >> "$(dirname "$0")/counter"`,);

    await probeHarnessCommand({ command: ["counted-harness",], envPath: dir, },);
    __resetHarnessAvailabilityCache();
    await probeHarnessCommand({ command: ["counted-harness",], envPath: dir, },);

    expect(invocationCount(dir,),).toBe(2,);
  });

  it("probes scoped per PATH value, so distinct scopes never share a verdict", async () => {
    const withBinary = makeDir();
    const withoutBinary = makeDir();
    writeScript(withBinary, "scoped-harness", `echo "scoped 9.9"`,);

    const present = await probeHarnessCommand({ command: ["scoped-harness",], envPath: withBinary, },);
    const absent = await probeHarnessCommand({ command: ["scoped-harness",], envPath: withoutBinary, },);

    expect(present,).toEqual({ available: true, version: "scoped 9.9", },);
    expect(absent.available,).toBe(false,);
  });
});
