// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI discovery probe.
 *
 * One cheap GET against the native `/system_stats` surface answers
 * reachability, the ComfyUI version and the advertised compute devices — the
 * same readiness endpoint the spawner lifecycle and llama-swap recipes
 * standardize on (`checkEndpoint: /system_stats`). The result is a
 * discriminated union so callers (admin discovery endpoint, failover skip)
 * branch on reachability instead of parsing error strings. Response parsing
 * is defensive: ComfyUI versions and proxy frontends vary in which fields
 * they advertise, so every field is optional and an unparseable document
 * degrades to a structured `malformed-response` reason rather than a throw.
 *
 * See https://docs.comfy.org/essential/core-concepts/system-stats
 */

import { safeFetch, } from "../../utils";

/** Native ComfyUI stats endpoint, relative to the provider base URL. */
export const COMFYUI_SYSTEM_STATS_PATH = "/system_stats";

/** Probe deadline when the caller does not narrow it. */
export const DEFAULT_COMFYUI_PROBE_TIMEOUT_MS = 3_000;

/** Why a probe concluded the server is not usable. */
export type ComfyUIProbeReason =
  | "invalid-base-url"
  | "unreachable"
  | "http-error"
  | "malformed-response";

/** One advertised compute device from the stats document. */
export interface ComfyUIProbeDevice {
  readonly name?: string;
  readonly type?: string;
}

/** A server that answered with a usable stats document. */
export interface ComfyUIProbeReachable {
  readonly reachable: true;
  /** Round-trip time of the stats request in ms. */
  readonly latencyMs: number;
  /** ComfyUI version when the document advertises one. */
  readonly version?: string;
  /** Python/PyTorch versions from `system`, when advertised. */
  readonly pythonVersion?: string;
  readonly pytorchVersion?: string;
  /** Compute devices from the `devices` array (names and types). */
  readonly devices: readonly ComfyUIProbeDevice[];
}

/** A server that could not be probed, with the structured reason. */
export interface ComfyUIProbeUnreachable {
  readonly reachable: false;
  readonly reason: ComfyUIProbeReason;
  /** Human-readable transport/parse detail. */
  readonly detail: string;
  /** HTTP status when the server answered with one. */
  readonly httpStatus?: number;
}

/** Probe outcome for one ComfyUI instance. */
export type ComfyUIProbe = ComfyUIProbeReachable | ComfyUIProbeUnreachable;

/** Options for {@link probeComfyUI}. */
export interface ProbeComfyUIOptions {
  /** Provider base URL (trailing slashes tolerated). */
  readonly baseUrl: string;
  /** Probe deadline in ms (default {@link DEFAULT_COMFYUI_PROBE_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
  /** Extra headers (auth) for reverse-proxy-fronted servers. */
  readonly headers?: Record<string, string>;
}

/** Shape of the stats document this module understands. Every field is
 * optional — server versions advertise different subsets. */
interface ComfyUIStatsDocument {
  system?: { comfyui_version?: unknown; python_version?: unknown; pytorch_version?: unknown };
  devices?: unknown;
}

/** Parsed stats info — every field optional except `devices`. */
export interface ComfyUIStatsInfo {
  readonly version?: string;
  readonly pythonVersion?: string;
  readonly pytorchVersion?: string;
  readonly devices: readonly ComfyUIProbeDevice[];
}

/**
 * Defensively parse a stats document.
 * @param data - parsed JSON body of `GET /system_stats`
 * @returns the extracted info, or a parse error when the body is not an object
 */
export function parseComfyUIStats(
  data: unknown,
): { ok: true; info: ComfyUIStatsInfo } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null || Array.isArray(data,)) {
    return { ok: false, error: "system_stats response is not a JSON object", };
  }

  const doc = data as ComfyUIStatsDocument;
  const system = typeof doc.system === "object" && doc.system !== null ? doc.system : undefined;

  const devices: ComfyUIProbeDevice[] = [];
  if (Array.isArray(doc.devices,)) {
    for (const value of doc.devices) {
      if (typeof value !== "object" || value === null) { continue; }
      const device = value as { name?: unknown; type?: unknown };
      devices.push({
        ...(asString(device.name,) !== undefined ? { name: asString(device.name,), } : {}),
        ...(asString(device.type,) !== undefined ? { type: asString(device.type,), } : {}),
      },);
    }
  }

  return {
    ok: true,
    info: {
      devices,
      ...(asString(system?.comfyui_version,) !== undefined ? { version: asString(system?.comfyui_version,), } : {}),
      ...(asString(system?.python_version,) !== undefined ? { pythonVersion: asString(system?.python_version,), } : {}),
      ...(asString(system?.pytorch_version,) !== undefined
        ? { pytorchVersion: asString(system?.pytorch_version,), }
        : {}),
    },
  };
}

/**
 * Probe one ComfyUI instance's native stats endpoint.
 *
 * Never throws — every transport, HTTP and parse outcome maps onto the
 * discriminated {@link ComfyUIProbe} union. A server that answers with a
 * non-2xx status (including a 404 from a non-ComfyUI HTTP server, or a 503
 * from a loading proxy) is reported unreachable with `http-error` so the
 * caller can name the real reason.
 * @param opts - Base URL, optional timeout and auth headers
 * @returns the probe outcome
 */
export async function probeComfyUI(opts: ProbeComfyUIOptions,): Promise<ComfyUIProbe> {
  const base = opts.baseUrl.trim().replace(/\/+$/, "",);
  if (!base) {
    return { reachable: false, reason: "invalid-base-url", detail: "baseUrl must not be blank", };
  }

  const url = `${base}${COMFYUI_SYSTEM_STATS_PATH}`;
  const start = Date.now();
  const result = await safeFetch<unknown>(url, {
    timeout: opts.timeoutMs ?? DEFAULT_COMFYUI_PROBE_TIMEOUT_MS,
    handle401: false,
    ...(opts.headers ? { headers: opts.headers, } : {}),
  },);

  if (!result.ok) {
    if (result.status === undefined) {
      return { reachable: false, reason: "unreachable", detail: result.error.message, };
    }

    if (result.status < 200 || result.status >= 300) {
      return {
        reachable: false,
        reason: "http-error",
        detail: `system_stats request answered HTTP ${String(result.status,)}: ${result.error.message}`,
        httpStatus: result.status,
      };
    }

    // A 2xx whose body could not be parsed as JSON — a server answering on
    // the stats path with something that is not the stats document.
    return {
      reachable: false,
      reason: "malformed-response",
      detail: result.error.message,
      httpStatus: result.status,
    };
  }

  const parsed = parseComfyUIStats(result.data,);
  if (!parsed.ok) {
    return {
      reachable: false,
      reason: "malformed-response",
      detail: parsed.error,
      httpStatus: result.status,
    };
  }

  return {
    reachable: true,
    latencyMs: Date.now() - start,
    ...parsed.info,
  };
}

/**
 * @param value - unknown JSON value
 * @returns the value when it is a non-empty string, else undefined
 */
function asString(value: unknown,): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
