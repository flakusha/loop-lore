// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Local headless Blender bridge: fail-soft capability probe and serialized
 * one-shot jobs. Blender is a background process, never an MCP server and
 * never an imported `bpy` module. All argv is built here; callers cannot pass
 * raw flags. Blender is GPL: this bridge keeps a process boundary, never
 * links `bpy`, and leaves generated output ownership with the operator.
 */

import { spawn, } from "bun";
import { createHash, } from "node:crypto";
import { safeJsonParse, safeJsonStringify, } from "../utils";

export const REQUIRED_BLENDER_VERSION = "4.5.15";
export const BLENDER_STAGES = ["voxel-remesh", "quadriflow", "smart-uv", "bake", "export-glb",] as const;

export type BlenderStage = typeof BLENDER_STAGES[number];

/** What a probe learned from one Blender binary. */
export interface BlenderCapabilityInfo {
  version: string;
  stages: readonly BlenderStage[];
  supported: boolean;
}

/** Reproducible stamp attached to every outcome that reached a process. */
export interface BlenderProvenance {
  binary: string;
  version: string;
  scriptDigest: string;
  startedAt: string;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
}

export interface BlenderProbeOptions {
  /** Path or PATH name; injectable so tests never launch Blender. */
  binary?: string;
  timeoutMs?: number;
}

export type BlenderProbeStatus = "unavailable" | "timeout" | "unsupported" | "malformed";

export type BlenderProbe =
  | { ok: true; info: BlenderCapabilityInfo; provenance: BlenderProvenance }
  | {
    ok: false;
    status: BlenderProbeStatus;
    message: string;
    info?: BlenderCapabilityInfo;
    provenance?: BlenderProvenance;
  };

/** Operator-provisioned recipe; `scriptPath` must never come from HTTP input. */
export interface BlenderJobSpec {
  scriptPath: string;
  stage: BlenderStage;
  params?: Record<string, unknown>;
  binary?: string;
  timeoutMs?: number;
  instanceId?: string;
}

export type BlenderJobResult =
  | { ok: true; stdout: string; provenance: BlenderProvenance }
  | {
    ok: false;
    status: "invalid" | "unavailable" | "timeout" | "failed";
    message: string;
    provenance?: BlenderProvenance;
  };

const PROBE_EXPR =
  "import bpy,json;stages={'voxel-remesh':hasattr(bpy.ops.object,'voxel_remesh'),'quadriflow':hasattr(bpy.ops.object,'quadriflow_remesh'),'smart-uv':hasattr(bpy.ops.uv,'smart_project'),'bake':hasattr(bpy.ops.object,'bake'),'export-glb':hasattr(bpy.ops.export_scene,'gltf')};print('BLENDER_CAP='+json.dumps({'version':bpy.app.version_string,'stages':[k for k,v in stages.items() if v]}))";

const DEFAULT_TIMEOUT_MS = 30_000;
const tails = new Map<string, Promise<void>>();

/** @returns a JSON digest that pins the exact recipe invoked. */
function digest(value: string,): string {
  return createHash("sha256",).update(value,).digest("hex",);
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
export function __resetBlenderLocks(): void {
  tails.clear();
}

interface ProcessOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  provenance: BlenderProvenance;
}

async function runProcess(argv: string[], timeoutMs: number, scriptDigest: string,): Promise<ProcessOutcome> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const binary = argv[0] ?? "blender";
  const stamp = (exitCode: number | null, timedOut: boolean,): BlenderProvenance => ({
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
    proc = spawn({ cmd: argv, stdout: "pipe", stderr: "pipe", },);
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
export function parseBlenderCapabilities(stdout: string,): BlenderCapabilityInfo | null {
  const line = stdout.split("\n",).find((candidate,) => candidate.startsWith("BLENDER_CAP=",));
  if (!line) { return null; }
  const parsed = safeJsonParse<unknown>(line.slice("BLENDER_CAP=".length,),);
  if (!parsed.ok) { return null; }

  const raw = parsed.value;
  if (!raw || typeof raw !== "object") { return null; }
  const doc = raw as Record<string, unknown>;
  const version = typeof doc.version === "string" ? doc.version : "";
  const stages = Array.isArray(doc.stages,)
    ? doc.stages.filter((s,): s is BlenderStage =>
      typeof s === "string" && (BLENDER_STAGES as readonly string[]).includes(s,)
    )
    : [];

  if (!version) { return null; }
  return { version, stages, supported: version === REQUIRED_BLENDER_VERSION, };
}

/**
 * Probe one local Blender binary. Never throws; every failure is a value.
 * Result documents are fail-soft like `probeHarnessCommand`.
 */
export async function probeBlender(options: BlenderProbeOptions = {},): Promise<BlenderProbe> {
  const binary = options.binary ?? "blender";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const out = await runProcess(
    [binary, "--background", "--factory-startup", "-noaudio", "--python-exit-code", "1", "--python-expr", PROBE_EXPR,],
    timeoutMs,
    digest(PROBE_EXPR,),
  );

  const info = parseBlenderCapabilities(out.stdout,);
  const provenance = { ...out.provenance, ...(info ? { version: info.version, } : {}), };
  if (out.timedOut) {
    return { ok: false, status: "timeout", message: "Blender capability probe timed out", provenance, };
  }

  if (out.exitCode !== 0) {
    return {
      ok: false,
      status: "unavailable",
      message: `Blender probe exited with ${out.exitCode ?? "unknown"}`,
      provenance,
    };
  }

  if (!info) {
    return { ok: false, status: "malformed", message: "Blender probe emitted no capabilities document", provenance, };
  }

  if (!info.supported) {
    return {
      ok: false,
      status: "unsupported",
      message: `Requires Blender ${REQUIRED_BLENDER_VERSION}, found ${info.version}`,
      info,
      provenance,
    };
  }

  return { ok: true, info, provenance, };
}

function validateJob(spec: BlenderJobSpec,): string | null {
  if (!spec.scriptPath.endsWith(".py",)) { return "recipe must be a .py file"; }
  if (!(BLENDER_STAGES as readonly string[]).includes(spec.stage,)) { return "unknown stage"; }
  return null;
}

/**
 * Run one recipe under a fixed argv shape. Jobs for the same instance are
 * FIFO-serialized; no user-controlled flag can reach Blender. Never throws.
 */
export async function runBlenderJob(spec: BlenderJobSpec,): Promise<BlenderJobResult> {
  const invalid = validateJob(spec,);
  if (invalid) { return { ok: false, status: "invalid", message: invalid, }; }
  const key = spec.instanceId ?? "default";
  return withInstanceLock(key, async () => {
    const binary = spec.binary ?? "blender";
    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const serialized = safeJsonStringify({ stage: spec.stage, params: spec.params ?? {}, },);
    if (!serialized.ok) { return { ok: false, status: "invalid", message: serialized.error.message, }; }

    const out = await runProcess(
      [
        binary,
        "--background",
        "--factory-startup",
        "-noaudio",
        "--python-exit-code",
        "1",
        "--python",
        spec.scriptPath,
        "--",
        serialized.value,
      ],
      timeoutMs,
      digest(spec.scriptPath,),
    );

    if (out.timedOut) {
      return { ok: false, status: "timeout", message: "Blender job timed out", provenance: out.provenance, };
    }

    if (out.exitCode !== 0) {
      return {
        ok: false,
        status: "failed",
        message: `Blender job exited with ${out.exitCode ?? "unknown"}: ${out.stderr.trim().slice(-500,)}`,
        provenance: out.provenance,
      };
    }

    return { ok: true, stdout: out.stdout, provenance: out.provenance, };
  },);
}
