// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cached, operator-visible Blender discovery. Never launches Blender in
 * module scope; the cache holds one snapshot until an explicit refresh or
 * reset. No TTL: a timed-out probe is a failure, not a stale-success signal.
 */

import { findBinary, } from "../services/external-server-utils";
import {
  type BlenderProbe,
  type BlenderProbeStatus,
  type BlenderProvenance,
  type BlenderStage,
  probeBlender,
} from "./bridge";

export interface BlenderDiscoverySnapshot {
  probedAt: string;
  binary: string | null;
  ok: boolean;
  /** Null only on success; failures reuse the bridge's status vocabulary. */
  status: BlenderProbeStatus | null;
  message: string;
  version: string | null;
  stages: readonly BlenderStage[];
  supported: boolean;
  provenance: BlenderProvenance | null;
}

export type BlenderProbeFn = (options: { binary: string; timeoutMs?: number },) => Promise<BlenderProbe>;

export interface BlenderDiscoveryOptions {
  /** Injectable PATH lookup; production uses `findBinary("blender")`. */
  findBinary?: (type: "blender",) => string | null;
  /** Injectable probe; tests never launch Blender. */
  probe?: BlenderProbeFn;
  timeoutMs?: number;
}

let cached: BlenderDiscoverySnapshot | undefined;

function toSnapshot(binary: string | null, probe: BlenderProbe,): BlenderDiscoverySnapshot {
  const base = {
    probedAt: new Date().toISOString(),
    binary,
    version: probe.info?.version ?? probe.provenance?.version ?? null,
    stages: probe.info?.stages ?? [],
    supported: probe.info?.supported ?? false,
    provenance: probe.provenance ?? null,
  };

  return probe.ok
    ? { ...base, ok: true, status: null, message: "", }
    : { ...base, ok: false, status: probe.status, message: probe.message, };
}

/** Return the cached snapshot, probing once on first use. Never throws. */
export async function discoverBlender(
  options: BlenderDiscoveryOptions = {},
): Promise<BlenderDiscoverySnapshot> {
  return cached ?? await refreshBlenderDiscovery(options,);
}

/** Force a fresh probe and replace the cached snapshot. Never throws. */
export async function refreshBlenderDiscovery(
  options: BlenderDiscoveryOptions = {},
): Promise<BlenderDiscoverySnapshot> {
  const binary = options.findBinary
    ? options.findBinary("blender",)
    : findBinary("blender",);

  if (!binary) {
    cached = {
      probedAt: new Date().toISOString(),
      binary: null,
      ok: false,
      status: "unavailable",
      message: "Blender binary not found on PATH",
      version: null,
      stages: [],
      supported: false,
      provenance: null,
    };

    return cached;
  }

  const probe = (options.probe ?? probeBlender)({
    binary,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs, }),
  },);

  cached = toSnapshot(binary, await probe,);
  return cached;
}

/** Drop the cached snapshot; the next `discoverBlender` probes again. */
export function resetBlenderDiscovery(): void {
  cached = undefined;
}
