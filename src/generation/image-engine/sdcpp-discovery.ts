// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * sd.cpp discovery probe.
 *
 * One cheap GET against the native `/sdcpp/v1/capabilities` surface answers
 * reachability, the server build/version, the loaded-model state and the
 * advertised model files. The result is a discriminated union so callers
 * (admin discovery endpoint, failover skip) branch on reachability instead of
 * parsing error strings. Response parsing is defensive: sd.cpp server
 * versions vary in which fields they advertise, so every field is optional
 * and an unparseable document degrades to a structured `malformed-response`
 * reason rather than a throw.
 *
 * See https://github.com/leejet/stable-diffusion.cpp/blob/master/examples/server/api.md
 */

import { safeFetch, } from "../../utils";

/** Native sd.cpp capabilities endpoint, relative to the provider base URL. */
export const SDCPP_CAPABILITIES_PATH = "/sdcpp/v1/capabilities";

/** Probe deadline when the caller does not narrow it. */
export const DEFAULT_SDCPP_PROBE_TIMEOUT_MS = 3_000;

/** Why a probe concluded the server is not usable. */
export type SdCppProbeReason =
  | "invalid-base-url"
  | "unreachable"
  | "http-error"
  | "malformed-response";

/** A server that answered with a usable capabilities document. */
export interface SdCppProbeReachable {
  readonly reachable: true;
  /** Round-trip time of the capabilities request in ms. */
  readonly latencyMs: number;
  /** Build/version string when the document advertises one. */
  readonly version?: string;
  /** Loaded-model state from the additive `runtime` status ("empty" | "loading" | "ready" | "error"). */
  readonly state?: string;
  /** Loaded model file ids from `runtime.models` (slot → file id). */
  readonly models: readonly string[];
  /** Server-side error from the runtime status, when present. */
  readonly serverError?: string;
}

/** A server that could not be probed, with the structured reason. */
export interface SdCppProbeUnreachable {
  readonly reachable: false;
  readonly reason: SdCppProbeReason;
  /** Human-readable transport/parse detail. */
  readonly detail: string;
  /** HTTP status when the server answered with one. */
  readonly httpStatus?: number;
}

/** Probe outcome for one sd.cpp instance. */
export type SdCppProbe = SdCppProbeReachable | SdCppProbeUnreachable;

/** Options for {@link probeSdCpp}. */
export interface ProbeSdCppOptions {
  /** Provider base URL (trailing slashes tolerated). */
  readonly baseUrl: string;
  /** Probe deadline in ms (default {@link DEFAULT_SDCPP_PROBE_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
  /** Extra headers (auth) for reverse-proxy-fronted servers. */
  readonly headers?: Record<string, string>;
}

/** Shape of the capabilities document this module understands. Every field is
 * optional — server versions advertise different subsets. */
interface SdCppCapabilitiesDocument {
  version?: unknown;
  build_info?: { build_number?: unknown; build_timestamp?: unknown };
  runtime?: { state?: unknown; error?: unknown; models?: unknown };
}

/** Parsed capabilities info — every field optional except `models`. */
export interface SdCppCapabilitiesInfo {
  readonly version?: string;
  readonly state?: string;
  readonly serverError?: string;
  readonly models: readonly string[];
}

/**
 * Defensively parse a capabilities document.
 * @param data - parsed JSON body of `GET /sdcpp/v1/capabilities`
 * @returns the extracted info, or a parse error when the body is not an object
 */
export function parseSdCppCapabilities(
  data: unknown,
): { ok: true; info: SdCppCapabilitiesInfo } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null || Array.isArray(data,)) {
    return { ok: false, error: "capabilities response is not a JSON object", };
  }

  const doc = data as SdCppCapabilitiesDocument;
  const buildInfo = typeof doc.build_info === "object" && doc.build_info !== null
    ? doc.build_info
    : undefined;

  const version = asString(doc.version,) ??
    asString(buildInfo?.build_number,) ??
    (typeof buildInfo?.build_number === "number"
      ? String(buildInfo.build_number,)
      : undefined);

  let state: string | undefined;
  let serverError: string | undefined;
  const models: string[] = [];
  const runtime = typeof doc.runtime === "object" && doc.runtime !== null ? doc.runtime : undefined;
  if (runtime) {
    state = asString(runtime.state,);
    serverError = asString(runtime.error,);
    if (typeof runtime.models === "object" && runtime.models !== null && !Array.isArray(runtime.models,)) {
      for (const value of Object.values(runtime.models,)) {
        const model = asString(value,);
        if (model) { models.push(model,); }
      }
    } else if (Array.isArray(runtime.models,)) {
      for (const value of runtime.models) {
        const model = asString(value,);
        if (model) { models.push(model,); }
      }
    }
  }

  return {
    ok: true,
    info: {
      models,
      ...(version ? { version, } : {}),
      ...(state ? { state, } : {}),
      ...(serverError ? { serverError, } : {}),
    },
  };
}

/**
 * Probe one sd.cpp instance's native capabilities endpoint.
 *
 * Never throws — every transport, HTTP and parse outcome maps onto the
 * discriminated {@link SdCppProbe} union. A server that answers with a
 * non-2xx status (including a 404 from a non-sd.cpp HTTP server, or a 503
 * while no model is loaded) is reported unreachable with `http-error` so the
 * caller can name the real reason.
 * @param opts - Base URL, optional timeout and auth headers
 * @returns the probe outcome
 */
export async function probeSdCpp(opts: ProbeSdCppOptions,): Promise<SdCppProbe> {
  const base = opts.baseUrl.trim().replace(/\/+$/, "",);
  if (!base) {
    return { reachable: false, reason: "invalid-base-url", detail: "baseUrl must not be blank", };
  }

  const url = `${base}${SDCPP_CAPABILITIES_PATH}`;
  const start = Date.now();
  const result = await safeFetch<unknown>(url, {
    timeout: opts.timeoutMs ?? DEFAULT_SDCPP_PROBE_TIMEOUT_MS,
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
        detail: `capabilities request answered HTTP ${String(result.status,)}: ${result.error.message}`,
        httpStatus: result.status,
      };
    }

    // A 2xx whose body could not be parsed as JSON — an sd.cpp-shaped server
    // answering with something that is not the capabilities document.
    return {
      reachable: false,
      reason: "malformed-response",
      detail: result.error.message,
      httpStatus: result.status,
    };
  }

  const parsed = parseSdCppCapabilities(result.data,);
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
