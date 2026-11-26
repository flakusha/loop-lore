// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local python3 bridge: fail-soft capability probe and serialized one-shot
 * jobs. Shape mirrors `src/blender/bridge.ts` (probe marker line, fixed
 * argv, FIFO per-instance lock, sha256 provenance, fail-soft unions,
 * shell-stub tests) without Blender's binary, stages, or version pin: the
 * probe reports the interpreter version and `supported` stays true whenever
 * the interpreter runs (report-only; a version floor arrives with the first
 * consumer that needs one). Package presence also waits for a consumer —
 * the probe prints `{version}` only. Known gap: Windows has no `python3`
 * on PATH (`py -3` handling deferred to the discovery ticket).
 */

import { spawn, } from "bun";
import { createHash, } from "node:crypto";
import fs from "node:fs";
import { join, relative, resolve, sep, } from "node:path";
import { safeJsonParse, safeJsonStringify, } from "../utils";

/** What a probe learned from one python3 binary. */
export interface PythonCapabilityInfo {
  version: string;
  /** Report-only until a consumer needs a floor; true when the version parsed. */
  supported: boolean;
}

/** Reproducible stamp attached to every outcome that reached a process. */
export interface PythonProvenance {
  binary: string;
  version: string;
  scriptDigest: string;
  startedAt: string;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
}

export interface PythonProbeOptions {
  /** Path or PATH name; injectable so tests never launch python. */
  binary?: string;
  /** Operator-provisioned venv; its `bin/python` replaces `binary` when given. */
  venvPath?: string;
  timeoutMs?: number;
}

export type PythonProbeStatus = "unavailable" | "timeout" | "unsupported" | "malformed";

export type PythonProbe =
  | { ok: true; info: PythonCapabilityInfo; provenance: PythonProvenance }
  | {
    ok: false;
    status: PythonProbeStatus;
    message: string;
    info?: PythonCapabilityInfo;
    provenance?: PythonProvenance;
  };

/** Operator-provisioned recipe; `scriptPath` must never come from HTTP input. */
export interface PythonJobSpec {
  scriptPath: string;
  params?: Record<string, unknown>;
  /** Working dir for the child; when given, `root` is required, the dir must stay under it, and `scriptPath`/`binary` should be absolute (the child resolves relatives against the workdir). */
  workdir?: string;
  /** Operator-configured root the workdir is confined to. */
  root?: string;
  /** Operator-provisioned venv; its `bin/python` replaces `binary` when given. Dependencies are installed out of band by the operator — the bridge never runs `pip install` (no network, no arbitrary code in the request path). */
  venvPath?: string;
  binary?: string;
  timeoutMs?: number;
  instanceId?: string;
}

export type PythonJobResult =
  | { ok: true; stdout: string; provenance: PythonProvenance }
  | {
    ok: false;
    status: "invalid" | "unavailable" | "timeout" | "failed";
    message: string;
    provenance?: PythonProvenance;
  };

const PROBE_EXPR = "import sys,json;print('PY_CAP='+json.dumps({'version':sys.version.split()[0]}))";

const DEFAULT_TIMEOUT_MS = 10_000;
const tails = new Map<string, Promise<void>>();

/** @returns a JSON digest that pins the exact recipe invoked. */
function digest(value: string | Uint8Array,): string {
  return createHash("sha256",).update(value,).digest("hex",);
}

/**
 * The interpreter for a probe or job: a named venv's `bin/python` wins over
 * an explicit binary. POSIX layout only; Windows `Scripts/python.exe`
 * arrives with the deferred `py -3` launcher work. Null when the named venv
 * has no interpreter.
 */
function venvBinary(venvPath: string | undefined, binary: string | undefined,): string | null {
  if (!venvPath) { return binary ?? "python3"; }
  const candidate = join(venvPath, "bin", "python",);
  return fs.existsSync(candidate,) ? candidate : null;
}

async function withInstanceLock<T,>(key: string, fn: () => Promise<T>,): Promise<T> {
  const previous = tails.get(key,) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve,) => {
    release = resolve;
  },);

  tails.set(key, mine,);
  await previous;
  try {
    return await fn();
  } finally {
    if (tails.get(key,) === mine) { tails.delete(key,); }
    release();
  }
}

/** Test seam: drops queued-per-instance tails. */
export function __resetPythonLocks(): void {
  tails.clear();
}

interface ProcessOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  provenance: PythonProvenance;
}

async function runProcess(
  argv: string[],
  timeoutMs: number,
  scriptDigest: string,
  cwd?: string,
): Promise<ProcessOutcome> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const binary = argv[0] ?? "python3";
  const stamp = (exitCode: number | null, timedOut: boolean,): PythonProvenance => ({
    binary,
    version: "unknown",
    scriptDigest,
    startedAt,
    durationMs: Date.now() - started,
    exitCode,
    timedOut,
  });

  let proc;
  try {
    proc = spawn({ cmd: argv, stdout: "pipe", stderr: "pipe", cwd, },);
  } catch {
    return { stdout: "", stderr: "", exitCode: null, timedOut: false, provenance: stamp(null, false,), };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve,) => {
    timer = setTimeout(() => {
      proc.kill();
      resolve(true,);
    }, timeoutMs,);
  },);

  try {
    const stdoutText = new Response(proc.stdout,).text();
    const stderrText = new Response(proc.stderr,).text();
    const expired = await Promise.race([proc.exited.then(() => false), timedOut,],);
    const stdout = await stdoutText;
    const stderr = await stderrText;
    return {
      stdout,
      stderr,
      exitCode: expired ? null : proc.exitCode,
      timedOut: expired,
      provenance: stamp(expired ? null : proc.exitCode, expired,),
    };
  } finally {
    clearTimeout(timer,);
  }
}

/** Parse the probe's single JSON line without trusting any other output. */
export function parsePythonCapabilities(stdout: string,): PythonCapabilityInfo | null {
  const line = stdout.split("\n",).find((candidate,) => candidate.startsWith("PY_CAP=",));
  if (!line) { return null; }
  const parsed = safeJsonParse<unknown>(line.slice("PY_CAP=".length,),);
  if (!parsed.ok) { return null; }

  const raw = parsed.value;
  if (!raw || typeof raw !== "object") { return null; }
  const doc = raw as Record<string, unknown>;
  const version = typeof doc.version === "string" ? doc.version.trim() : "";
  if (!version) { return null; }
  return { version, supported: true, };
}

/**
 * Probe one local python3 binary. Never throws; every failure is a value.
 */
export async function probePython(options: PythonProbeOptions = {},): Promise<PythonProbe> {
  const binary = venvBinary(options.venvPath, options.binary,);
  if (!binary) {
    return {
      ok: false,
      status: "unavailable",
      message: `venv python not found at ${join(options.venvPath ?? "", "bin", "python",)}`,
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const out = await runProcess([binary, "-c", PROBE_EXPR,], timeoutMs, digest(PROBE_EXPR,),);

  const info = parsePythonCapabilities(out.stdout,);
  const provenance = { ...out.provenance, ...(info ? { version: info.version, } : {}), };
  if (out.timedOut) {
    return { ok: false, status: "timeout", message: "Python capability probe timed out", provenance, };
  }

  if (out.exitCode !== 0) {
    return {
      ok: false,
      status: "unavailable",
      message: `Python probe exited with ${out.exitCode ?? "unknown"}`,
      provenance,
    };
  }

  if (!info) {
    return { ok: false, status: "malformed", message: "Python probe emitted no capabilities document", provenance, };
  }

  return { ok: true, info, provenance, };
}

function validateJob(spec: PythonJobSpec,): string | null {
  if (!spec.scriptPath.endsWith(".py",)) { return "recipe must be a .py file"; }
  if (spec.venvPath && !venvBinary(spec.venvPath, undefined,)) {
    return `venv python not found at ${join(spec.venvPath, "bin", "python",)}`;
  }

  if (spec.workdir !== undefined) {
    if (spec.root === undefined) { return "workdir requires an operator-configured root"; }
    const scoped = relative(resolve(spec.root,), resolve(spec.root, spec.workdir,),);
    if (scoped === ".." || scoped.startsWith(`..${sep}`,)) { return "workdir is outside the configured root"; }
  }

  return null;
}

/**
 * Run one recipe under a fixed argv shape. Jobs for the same instance are
 * FIFO-serialized; no user-controlled flag can reach python. Never throws.
 */
export async function runPythonJob(spec: PythonJobSpec,): Promise<PythonJobResult> {
  const invalid = validateJob(spec,);
  if (invalid) { return { ok: false, status: "invalid", message: invalid, }; }
  const key = spec.instanceId ?? "default";
  return withInstanceLock(key, async () => {
    const binary = venvBinary(spec.venvPath, spec.binary,) ?? "python3";
    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const serialized = safeJsonStringify(spec.params ?? {},);
    if (!serialized.ok) { return { ok: false, status: "invalid", message: serialized.error.message, }; }

    let recipe: Buffer;
    try {
      recipe = fs.readFileSync(spec.scriptPath,);
    } catch (err) {
      return {
        ok: false,
        status: "invalid",
        message: `Cannot read recipe: ${err instanceof Error ? err.message : String(err,)}`,
      };
    }

    const out = await runProcess(
      [binary, spec.scriptPath, "--", serialized.value,],
      timeoutMs,
      digest(recipe,),
      spec.workdir,
    );

    if (out.timedOut) {
      return { ok: false, status: "timeout", message: "Python job timed out", provenance: out.provenance, };
    }

    if (out.exitCode !== 0) {
      return {
        ok: false,
        status: "failed",
        message: `Python job exited with ${out.exitCode ?? "unknown"}: ${out.stderr.trim().slice(-500,)}`,
        provenance: out.provenance,
      };
    }

    return { ok: true, stdout: out.stdout, provenance: out.provenance, };
  },);
}
