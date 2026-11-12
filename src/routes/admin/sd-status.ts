// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Static, } from "@sinclair/typebox";
import { Elysia, t, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import { sdServerAuthHeaders, } from "../../generation/image-engine/sd-server-jobs";
import {
  DEFAULT_SDCPP_PROBE_TIMEOUT_MS,
  probeSdCpp,
  type SdCppProbe,
} from "../../generation/image-engine/sdcpp-discovery";
import { listSdCppSetups, sdCppSecretKey, } from "../../generation/image-engine/sdcpp-setup";
import { safeFetch, } from "../../utils";
import { AdminSdCppDiscoveryResponse, ErrorResponse, } from "../../validation/schemas";
import {
  jsonResponse,
  requirePermissionUserId,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** One sd.cpp instance to probe in the discovery sweep. */
interface SdCppCandidate {
  /** Instance name ("auto-start" for the spawned instance). */
  readonly name: string;
  readonly baseUrl: string;
  /** Where the candidate came from. */
  readonly source: "config" | "stored" | "auto-start";
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
async function storedAuthHeaders(
  db: AdminRouteOpts["database"],
  name: string,
): Promise<Record<string, string> | undefined> {
  const stored = await getConfigValue(db, sdCppSecretKey(name,),);
  return stored ? sdServerAuthHeaders(stored,) : undefined;
}

/**
 * Collect every sd.cpp candidate to probe: stored setups first (they override
 * same-name config providers on the dispatch path), then config-file sd.cpp
 * providers, then the auto-spawned instance when no candidate already covers
 * its URL.
 * @param opts - admin route options (config snapshot + database)
 * @returns the deduplicated candidate list
 */
async function sdcppDiscoveryCandidates(opts: AdminRouteOpts,): Promise<SdCppCandidate[]> {
  const configured = opts.config.generation?.providers?.sd ?? [];
  const stored = await listSdCppSetups(opts.database,);
  const configNames = new Set(configured.map((provider,) => provider.name),);
  const seenNames = new Set<string>();
  const seenUrls = new Set<string>();
  const candidates: SdCppCandidate[] = [];

  for (const descriptor of stored) {
    candidates.push({
      name: descriptor.name,
      baseUrl: descriptor.baseUrl,
      source: "stored",
      // A stored setup sharing a config-file name replaces that provider on
      // the dispatch path — the stored row is what serves generation.
      dispatching: configNames.has(descriptor.name,),
      headers: await storedAuthHeaders(opts.database, descriptor.name,),
    },);

    seenNames.add(descriptor.name,);
    seenUrls.add(descriptor.baseUrl.replace(/\/+$/, "",),);
  }

  for (const provider of configured) {
    if (provider.apiFamily !== "sdcpp" || seenNames.has(provider.name,)) { continue; }
    candidates.push({
      name: provider.name,
      baseUrl: provider.baseUrl,
      source: "config",
      dispatching: true,
      headers: sdServerAuthHeaders(provider.apiKey,),
    },);

    seenNames.add(provider.name,);
    seenUrls.add(provider.baseUrl.replace(/\/+$/, "",),);
  }

  const autoStart = opts.config.generation?.autoStart?.sdCpp;
  if (autoStart?.enabled) {
    const baseUrl = `http://127.0.0.1:${String(autoStart.port,)}`;
    if (!seenUrls.has(baseUrl.replace(/\/+$/, "",),)) {
      candidates.push({ name: "auto-start", baseUrl, source: "auto-start", dispatching: false, },);
    }
  }

  return candidates;
}

/**
 * Map a probe outcome onto its discovery response entry.
 * @param candidate - the probed candidate
 * @param probe - the probe outcome
 * @returns the response entry (never carries key material)
 */
function probeToEntry(
  candidate: SdCppCandidate,
  probe: SdCppProbe,
): Static<typeof AdminSdCppDiscoveryResponse>["providers"][number] {
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
    models: [...probe.models,],
    ...(probe.version ? { version: probe.version, } : {}),
    ...(probe.state ? { state: probe.state, } : {}),
    ...(probe.serverError ? { serverError: probe.serverError, } : {}),
  };
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "sd-status": { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function sdStatusRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-sd-status", },)
      // ── SD.CPP status ──────────────────────────────────────
      .get(`${prefix}/admin/sd-status`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const config = opts.config;
        const sdPort: number = (config as any).generation?.autoStart?.sdCpp?.port ?? 9010;
        let status: "running" | "stopped" | "unknown";
        let latencyMs: number | null = null;

        const start = Date.now();
        const result = await safeFetch<string>(`http://127.0.0.1:${String(sdPort,)}/`, {
          timeout: 5_000,
          parseJson: false,
        },);

        if (result.ok || result.status !== undefined) {
          latencyMs = Date.now() - start;
        }

        status = result.ok ? "running" : "stopped";

        return jsonResponse({
          status,
          port: sdPort,
          latencyMs,
        },);
      }, {
        response: {
          200: t.Object({ status: t.String(), port: t.Number(), latencyMs: t.Optional(t.Number(),), },),
          403: ErrorResponse,
        },
      },)
      // ── SD.CPP discovery sweep ─────────────────────────────
      .get(`${prefix}/admin/sd-status/sdcpp`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }

        const candidates = await sdcppDiscoveryCandidates(opts,);
        const providers = (
          await Promise.allSettled(
            Array.from(candidates, async (candidate,) => ({
              candidate,
              probe: await probeSdCpp({
                baseUrl: candidate.baseUrl,
                timeoutMs: DEFAULT_SDCPP_PROBE_TIMEOUT_MS,
                ...(candidate.headers ? { headers: candidate.headers, } : {}),
              },),
            }),),
          )
        ).map((entry,) => {
          // probeSdCpp never rejects — the placeholder keeps the response shape.
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

          return probeToEntry(entry.value.candidate, entry.value.probe,);
        },);

        return jsonResponse({ probedAt: new Date().toISOString(), providers, },);
      }, {
        detail: {
          summary: "Probe every sd.cpp instance",
          description: "Probes the native /sdcpp/v1/capabilities endpoint of each candidate sd.cpp " +
            "instance — stored setups, config-file providers and the auto-spawned instance — and reports " +
            "reachability, version, loaded-model state, models and the structured skip reason. " +
            "Never carries key material.",
          tags: ["Admin", "Providers",],
        },
        response: {
          200: AdminSdCppDiscoveryResponse,
          403: ErrorResponse,
        },
      },)
  );
}
