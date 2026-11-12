// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI discovery sweep — the sd.cpp counterpart in `sd-status.ts`, against
 * ComfyUI's native `/system_stats` readiness endpoint.
 *
 *   GET /api/admin/sd-status/comfyui — probe every candidate instance
 *
 * Candidates: stored setups first (they override same-name config providers on
 * the dispatch path), then config-file ComfyUI providers. There is no
 * auto-spawn candidate — ComfyUI auto-start is not part of the config schema
 * yet. Never echoes key material.
 */

import type { Static, } from "@sinclair/typebox";
import { Elysia, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import {
  type ComfyUIProbe,
  DEFAULT_COMFYUI_PROBE_TIMEOUT_MS,
  probeComfyUI,
} from "../../generation/image-engine/comfyui-discovery";
import {
  comfyUISecretKey,
  listComfyUISetups,
} from "../../generation/image-engine/comfyui-setup";
import { sdServerAuthHeaders, } from "../../generation/image-engine/sd-server-jobs";
import {
  AdminComfyUIDiscoveryResponse,
  ErrorResponse,
} from "../../validation/schemas";
import { jsonResponse, requirePermissionUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** One ComfyUI instance to probe in the discovery sweep. */
interface ComfyUICandidate {
  /** Instance name. */
  readonly name: string;
  readonly baseUrl: string;
  /** Where the candidate came from. */
  readonly source: "config" | "stored";
  /** Whether the generation failover path dispatches to this instance. */
  readonly dispatching: boolean;
  /** Optional auth headers for the probe (never echoed back). */
  readonly headers?: Record<string, string>;
}

/**
 * @param db - Kysely database handle
 * @param name - stored setup instance name
 * @returns Bearer headers from the stored (sealed) key, or undefined when none
 */
async function storedComfyAuthHeaders(
  db: AdminRouteOpts["database"],
  name: string,
): Promise<Record<string, string> | undefined> {
  const stored = await getConfigValue(db, comfyUISecretKey(name,),);
  return stored ? sdServerAuthHeaders(stored,) : undefined;
}

/**
 * Collect every ComfyUI candidate to probe: stored setups first, then
 * config-file providers whose names the stored rows do not already cover.
 * @param opts - admin route options (config snapshot + database)
 * @returns the deduplicated candidate list
 */
async function comfyUIDiscoveryCandidates(opts: AdminRouteOpts,): Promise<ComfyUICandidate[]> {
  const configured = opts.config.generation?.providers?.sd ?? [];
  const stored = await listComfyUISetups(opts.database,);
  const configNames = new Set(configured.map((provider,) => provider.name),);
  const seenNames = new Set<string>();
  const candidates: ComfyUICandidate[] = [];

  for (const descriptor of stored) {
    candidates.push({
      name: descriptor.name,
      baseUrl: descriptor.baseUrl,
      source: "stored",
      // A stored setup sharing a config-file name replaces that provider on
      // the dispatch path — the stored row is what serves generation.
      dispatching: configNames.has(descriptor.name,),
      headers: await storedComfyAuthHeaders(opts.database, descriptor.name,),
    },);

    seenNames.add(descriptor.name,);
  }

  for (const provider of configured) {
    if (provider.apiFamily !== "comfyui" || seenNames.has(provider.name,)) { continue; }
    candidates.push({
      name: provider.name,
      baseUrl: provider.baseUrl,
      source: "config",
      dispatching: true,
      headers: sdServerAuthHeaders(provider.apiKey,),
    },);

    seenNames.add(provider.name,);
  }

  return candidates;
}

/**
 * Map a probe outcome onto its discovery response entry.
 * @param candidate - the probed candidate
 * @param probe - the probe outcome
 * @returns the response entry (never carries key material)
 */
function comfyProbeToEntry(
  candidate: ComfyUICandidate,
  probe: ComfyUIProbe,
): Static<typeof AdminComfyUIDiscoveryResponse>["providers"][number] {
  const base = {
    name: candidate.name,
    baseUrl: candidate.baseUrl,
    source: candidate.source,
    dispatching: candidate.dispatching,
    reachable: probe.reachable,
  };

  if (!probe.reachable) {
    return {
      ...base,
      reason: probe.reason,
      detail: probe.detail,
      ...(probe.httpStatus !== undefined ? { httpStatus: probe.httpStatus, } : {}),
    };
  }

  return {
    ...base,
    latencyMs: probe.latencyMs,
    devices: probe.devices.map((device,) => ({ ...device, })),
    ...(probe.version ? { version: probe.version, } : {}),
    ...(probe.pythonVersion ? { pythonVersion: probe.pythonVersion, } : {}),
    ...(probe.pytorchVersion ? { pytorchVersion: probe.pytorchVersion, } : {}),
  };
}

/**
 * @param opts - admin route options (config snapshot + database)
 * @param prefix - route prefix
 * @returns Elysia plugin with the ComfyUI discovery sweep endpoint
 */
export function comfyUIStatusRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-comfyui-status", },)
      // ── ComfyUI discovery sweep ────────────────────────────
      .get(`${prefix}/admin/sd-status/comfyui`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const candidates = await comfyUIDiscoveryCandidates(opts,);
        const providers = (
          await Promise.allSettled(
            Array.from(candidates, async (candidate,) => ({
              candidate,
              probe: await probeComfyUI({
                baseUrl: candidate.baseUrl,
                timeoutMs: DEFAULT_COMFYUI_PROBE_TIMEOUT_MS,
                ...(candidate.headers ? { headers: candidate.headers, } : {}),
              },),
            }),),
          )
        ).map((entry,) => {
          // probeComfyUI never rejects — the placeholder keeps the response shape.
          if (entry.status !== "fulfilled") {
            return {
              name: "unknown",
              baseUrl: "",
              source: "config" as const,
              dispatching: false,
              reachable: false,
              reason: "unreachable" as const,
              detail: String(entry.reason,),
            };
          }

          return comfyProbeToEntry(entry.value.candidate, entry.value.probe,);
        },);

        return jsonResponse({ probedAt: new Date().toISOString(), providers, },);
      }, {
        detail: {
          summary: "Probe every ComfyUI instance",
          description: "Probes the native /system_stats endpoint of each candidate ComfyUI instance — " +
            "stored setups and config-file providers — and reports reachability, the ComfyUI version, " +
            "advertised compute devices and the structured skip reason. Never carries key material.",
          tags: ["Admin", "Providers",],
        },
        response: {
          200: AdminComfyUIDiscoveryResponse,
          403: ErrorResponse,
        },
      },)
  );
}
