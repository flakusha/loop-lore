// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * availability.ts — lazy binary availability probes for harness profiles
 * (TASK-optional-dep-packaging).
 *
 * The epic's "optional deps via peerDependencies" framing reduces to a
 * binary-presence concern in this codebase: the harness integration drives
 * EXTERNAL binaries (omp / opencode / codex / claude-code) over ACP stdio,
 * and nothing under `src/integrations/harness/` imports an npm package
 * dynamically — the repo's manifests carry no peerDependencies or
 * optionalDependencies at all, so there is no npm dep to make optional and
 * adding manifest entries would be dead weight. What can actually fail is
 * the spawn: this module answers "is the configured binary present, and
 * what version" without ever starting a harness session, downloading, or
 * auto-installing anything.
 *
 * Mirrors `src/native/loader.ts`: the first probe is lazy (nothing at module
 * load), the verdict is cached per process, and an explicit `__reset` seam
 * lets tests exercise each path. Probes are fail-soft — every failure is a
 * value in the verdict union, never a throw.
 */

import { type ChildProcess, spawn, } from "node:child_process";
import fs from "node:fs";
import { delimiter, join, } from "node:path";
import { safeJsonStringify, } from "../../utils";

/** Availability verdict for one profile's configured binary. */
export type HarnessBinaryAvailability =
  | {
    available: true;
    /** First line of `--version` output; null when the binary gave none. */
    version: string | null;
  }
  | {
    available: false;
    /** Human-readable reason the configured command cannot be spawned. */
    reason: string;
  };

/** Options for {@link probeHarnessCommand}. */
export interface ProbeHarnessCommandOptions {
  /** Spawn argv of the profile; only `command[0]` is probed. */
  command: string[];
  /**
   * PATH value to resolve against. Defaults to `process.env.PATH`; the
   * override is a test seam so fixtures never mutate the real environment.
   */
  envPath?: string;
  /** Version-probe budget in ms (default 2500). */
  timeoutMs?: number;
  /** Bypass and overwrite the per-process cache (admin re-probe). */
  refresh?: boolean;
}

/** Budget for the `--version` spawn when the caller pins none. */
const DEFAULT_VERSION_TIMEOUT_MS = 2_500;

/**
 * Verdict cache, keyed by (PATH scope, command[0]). Populated lazily by
 * {@link probeHarnessCommand}; cleared only by the reset seam.
 */
const cache = new Map<string, HarnessBinaryAvailability>();

/**
 * Reset the verdict cache — test seam, mirroring
 * `__resetNativeModuleCache`, so unit tests can exercise each probe path in
 * sequence. Admin callers use `{ refresh: true }` instead.
 * @internal Test-only; never call from application code.
 * @returns {void}
 */
export function __resetHarnessAvailabilityCache(): void {
  cache.clear();
}

/**
 * Locate `binary` the way a bare spawn would. A command carrying a path
 * separator is checked directly (spawn's own resolution); a bare name is
 * searched across the PATH entries. Executability is deliberately NOT
 * checked here — the version spawn is the authority, and a found-but-not-
 * executable file surfaces as an `EACCES` spawn failure (typed verdict, not
 * a silent pass).
 * @param binary - the command's argv[0]
 * @param pathValue - the PATH value to scan
 * @returns the absolute candidate, or null when nothing matches.
 */
function resolveOnPath(binary: string, pathValue: string,): string | null {
  if (binary.includes("/",) || binary.includes("\\",)) {
    return fs.existsSync(binary,) ? binary : null;
  }

  for (const dir of pathValue.split(delimiter,)) {
    if (dir.length === 0) { continue; }
    const candidate = join(dir, binary,);
    if (fs.existsSync(candidate,)) { return candidate; }
  }

  return null;
}

/**
 * Internal version-probe outcome: `spawned` verdicts are availability;
 * spawn rejections are typed reasons.
 */
type VersionProbeOutcome =
  | { spawned: true; version: string | null }
  | { spawned: false; reason: string };

/**
 * Spawn `<binary> --version` and collect its first stdout line. Runs with a
 * hard timeout that kills the child — a `--version` that hangs must not hang
 * the admin surface. Never rejects.
 * @param binary - resolved absolute binary path
 * @param timeoutMs - kill budget for the version spawn
 * @returns the collected outcome.
 */
function probeVersion(binary: string, timeoutMs: number,): Promise<VersionProbeOutcome> {
  const { promise, resolve, } = Promise.withResolvers<VersionProbeOutcome>();
  let settled = false;
  let child: ChildProcess | null = null;

  const done = (outcome: VersionProbeOutcome,) => {
    if (settled) { return; }
    settled = true;
    child?.kill();
    resolve(outcome,);
  };

  try {
    child = spawn(binary, ["--version",], { stdio: ["ignore", "pipe", "pipe",], },);
  } catch (error) {
    done({ spawned: false, reason: `spawn failed: ${(error as Error).message}`, },);
    return promise;
  }

  const timer = setTimeout(() => {
    // Timed out but the binary exists and launches: available, version
    // simply undiscoverable.
    done({ spawned: true, version: null, },);
  }, timeoutMs,);

  let stdout = "";
  child.stdout?.setEncoding("utf8",);
  child.stdout?.on("data", (chunk: string,) => {
    stdout += chunk;
  },);

  child.on("error", (err,) => {
    clearTimeout(timer,);
    // ENOENT here means the binary vanished between the PATH scan and the
    // spawn (TOCTOU); EACCES means it was never runnable.
    done({ spawned: false, reason: `spawn failed: ${err.message}`, },);
  },);

  child.on("close", (code,) => {
    clearTimeout(timer,);
    // A nonzero exit is a broken `--version`, not a missing binary.
    if (code !== 0) {
      done({ spawned: true, version: null, },);
      return;
    }

    const firstLine = stdout.split("\n",).map((line,) => line.trim()).find((line,) => line.length > 0);
    done({ spawned: true, version: firstLine ?? null, },);
  },);

  return promise;
}

/**
 * Run one availability probe for a profile command. Fail-soft: every
 * failure mode resolves into the verdict union; this function never throws
 * and never leaves an unbounded child behind.
 * @param binary - the profile command's argv[0]
 * @param options - probe options minus `refresh`/`command`
 * @returns the availability verdict.
 */
async function runProbe(
  binary: string,
  options: Omit<ProbeHarnessCommandOptions, "command" | "refresh">,
): Promise<HarnessBinaryAvailability> {
  if (binary.length === 0) {
    return { available: false, reason: "empty command", };
  }

  try {
    const resolved = resolveOnPath(binary, options.envPath ?? process.env.PATH ?? "",);
    if (resolved === null) {
      return { available: false, reason: `"${binary}" not found on PATH`, };
    }

    const outcome = await probeVersion(resolved, options.timeoutMs ?? DEFAULT_VERSION_TIMEOUT_MS,);
    return outcome.spawned
      ? { available: true, version: outcome.version, }
      : { available: false, reason: outcome.reason, };
  } catch (error) {
    return { available: false, reason: `probe failed: ${(error as Error).message}`, };
  }
}

/**
 * Probe whether a profile's configured binary is available, reporting its
 * version when discoverable. The verdict is cached per process (keyed by
 * PATH scope + argv[0]); pass `{ refresh: true }` to re-probe. Lazy by
 * construction — importing this module never spawns anything.
 * @param options - profile command, optional PATH override / timeout / refresh
 * @returns the availability verdict; never throws.
 */
export async function probeHarnessCommand(
  options: ProbeHarnessCommandOptions,
): Promise<HarnessBinaryAvailability> {
  const binary = options.command[0] ?? "";

  const serializedKey = safeJsonStringify([options.envPath ?? null, binary,],);
  const cacheKey = serializedKey.ok
    ? serializedKey.value
    : `${options.envPath ?? "process"}\u241f${binary}`;

  if (options.refresh !== true) {
    const hit = cache.get(cacheKey,);
    if (hit !== undefined) { return hit; }
  }

  const verdict = await runProbe(binary, options,);
  cache.set(cacheKey, verdict,);
  return verdict;
}
