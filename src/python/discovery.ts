// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cached, operator-visible python3 discovery. Never launches python in
 * module scope; the cache holds one snapshot until an explicit refresh or
 * reset. No TTL: a timed-out probe is a failure, not a stale-success signal.
 */

import { findBinary, } from "../services/external-server-utils";
import {
  probePython,
  type PythonProbe,
  type PythonProbeStatus,
  type PythonProvenance,
} from "./bridge";

export interface PythonDiscoverySnapshot {
  probedAt: string;
  binary: string | null;
  ok: boolean;
  /** Null only on success; failures reuse the bridge's status vocabulary. */
  status: PythonProbeStatus | null;
  message: string;
  version: string | null;
  supported: boolean;
  provenance: PythonProvenance | null;
}

export type PythonProbeFn = (options: { binary: string; timeoutMs?: number },) => Promise<PythonProbe>;

export interface PythonDiscoveryOptions {
  /** Injectable PATH lookup; production uses `findBinary("python")`. */
  findBinary?: (type: "python",) => string | null;
  /** Injectable probe; tests never launch python. */
  probe?: PythonProbeFn;
  timeoutMs?: number;
}

let cached: PythonDiscoverySnapshot | undefined;

function toSnapshot(binary: string | null, probe: PythonProbe,): PythonDiscoverySnapshot {
  const base = {
    probedAt: new Date().toISOString(),
    binary,
    version: probe.info?.version ?? probe.provenance?.version ?? null,
    supported: probe.info?.supported ?? false,
    provenance: probe.provenance ?? null,
  };

  return probe.ok
    ? { ...base, ok: true, status: null, message: "", }
    : { ...base, ok: false, status: probe.status, message: probe.message, };
}

/** Return the cached snapshot, probing once on first use. Never throws. */
export async function discoverPython(
  options: PythonDiscoveryOptions = {},
): Promise<PythonDiscoverySnapshot> {
  return cached ?? await refreshPythonDiscovery(options,);
}

/** Force a fresh probe and replace the cached snapshot. Never throws. */
export async function refreshPythonDiscovery(
  options: PythonDiscoveryOptions = {},
): Promise<PythonDiscoverySnapshot> {
  const binary = options.findBinary
    ? options.findBinary("python",)
    : findBinary("python",);

  if (!binary) {
    cached = {
      probedAt: new Date().toISOString(),
      binary: null,
      ok: false,
      status: "unavailable",
      message: "Python binary not found on PATH",
      version: null,
      supported: false,
      provenance: null,
    };

    return cached;
  }

  const probe = (options.probe ?? probePython)({
    binary,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs, }),
  },);

  cached = toSnapshot(binary, await probe,);
  return cached;
}

/** Drop the cached snapshot; the next `discoverPython` probes again. */
export function resetPythonDiscovery(): void {
  cached = undefined;
}
