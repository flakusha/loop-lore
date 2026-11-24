// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 800

/**
 * Honkbox capability registry.
 *
 * One cheap GET against the landed `GET /v1/capabilities` contract answers
 * feature flags, format limits and the resource-ledger admission knobs. The
 * result is a discriminated union so callers gate UI and dispatch on flags
 * instead of parsing error strings. `baseUrl` already includes `/v1`, so the
 * probe is `${baseUrl}/capabilities` — never `${baseUrl}/v1/capabilities`.
 *
 * Mirrors honkbox `crates/api-types/src/lib.rs::Capabilities`. Parsing is
 * defensive: an unknown major `api_version` warns and degrades (all flags
 * read false), a missing optional object counts as an absent flag, and no
 * outcome throws.
 */

import { createHash, } from "node:crypto";
import { getChildLogger, } from "../../logger";
import { safeFetch, } from "../../utils";

/** Native capabilities endpoint, relative to the provider base URL (`/v1` included). */
export const HONKBOX_CAPABILITIES_PATH = "/capabilities";

/** Probe deadline when the caller does not narrow it. */
export const DEFAULT_HONKBOX_PROBE_TIMEOUT_MS = 3_000;

/** Wire-contract major this client understands (`"v1"`). */
export const HONKBOX_SUPPORTED_API_MAJOR = 1;

/** Capability keys the feature gate understands. */
export const HONKBOX_FEATURE_KEYS = [
  "vision",
  "controlnet",
  "lora",
  "video",
  "jobs",
  "events",
  "vad",
  "experimentalAshSd",
  "blender",
  "artifactDelivery",
  "imageOps",
  "tools",
  "recognition",
  "decisions",
  "audio_cpp",
  "rerank",
  "python_sidecar",
  "texture_postprocess",
  "fizgig",
  "residency_control",
] as const;

/** */
export type HonkboxFeatureKey = (typeof HONKBOX_FEATURE_KEYS)[number];

/** Every key in the landed Capabilities contract, flags plus descriptors. */
export type HonkboxCapabilityKey =
  | HonkboxFeatureKey
  | "formats"
  | "auth"
  | "queue"
  | "openapi"
  | "models";

/** Server identity (`Capabilities::server`). */
export interface HonkboxServerInfo {
  readonly name: string;
  readonly version: string;
}

/** Vision flag (`FeatureFlags::vision`). */
export interface HonkboxVisionFeature {
  readonly built: boolean;
  readonly models: number;
}

/** ControlNet flag (`FeatureFlags::controlnet`). */
export interface HonkboxControlNetFeature {
  readonly available: boolean;
  readonly models: number;
}

/** Compile-time audio.cpp surface (`FeatureFlags::audio_cpp`). */
export interface HonkboxAudioCppFeature {
  readonly built: boolean;
  readonly sttFamilies: readonly string[];
  readonly ttsFamilies: readonly string[];
}

/** All feature flags (`Capabilities::features`). */
export interface HonkboxFeatureFlags {
  readonly vision: HonkboxVisionFeature;
  readonly controlnet: HonkboxControlNetFeature;
  readonly lora: boolean;
  readonly video: boolean;
  readonly jobs: boolean;
  readonly events: boolean;
  readonly vad: boolean;
  readonly experimentalAshSd: boolean;
  readonly blender: boolean;
  readonly artifactDelivery: boolean;
  readonly decisions?: boolean;
  readonly audioCpp?: HonkboxAudioCppFeature;
  readonly rerank?: boolean;
  readonly pythonSidecar?: boolean;
  readonly texturePostprocess?: boolean;
  readonly fizgig?: boolean;
  readonly residencyControl?: boolean;
}

/** One writable container (`Formats::write`). */
export interface HonkboxOutputFormat {
  readonly format: string;
  readonly compression: boolean;
}

/** Size/quality limits (`Formats::limits`). */
export interface HonkboxFormatLimits {
  readonly outputCompression: { readonly min: number; readonly max: number; readonly appliesTo: string };
  readonly bodyBytes: number;
}

/** Image containers and limits (`Capabilities::formats`). */
export interface HonkboxFormats {
  readonly read: readonly string[];
  readonly write: readonly HonkboxOutputFormat[];
  readonly limits: HonkboxFormatLimits;
}

/** Auth mode (`Capabilities::auth`); the key value is never exposed. */
export interface HonkboxAuth {
  readonly mode: string;
}

/** Scoped-credential surface (`Capabilities::scopes`): whether scoped keys are
 * enabled and which scoped consumers exist, by key env-var NAME (never
 * values). Absent on older servers, which only know the single legacy key. */
export interface HonkboxScopes {
  readonly enabled: boolean;
  readonly consumers: readonly string[];
}

/** One per-kind admission queue row (`QueueCapabilities::kinds`). */
export interface HonkboxQueueKind {
  readonly kind: string;
  readonly queueCap: number;
  readonly ttlSecs: number;
}

/** Resource-ledger admission knobs (`Capabilities::queue`). */
export interface HonkboxQueue {
  readonly gpuSlots: number;
  readonly queueWaitSecs: number;
  readonly retryAfterSecs: number;
  readonly kinds: readonly HonkboxQueueKind[];
}

/** Parsed, non-secret honkbox capabilities descriptor. */
export interface HonkboxCapabilities {
  readonly apiVersion: string;
  readonly server: HonkboxServerInfo;
  readonly features: HonkboxFeatureFlags;
  readonly formats: HonkboxFormats;
  readonly auth: HonkboxAuth;
  readonly scopes?: HonkboxScopes;
  readonly queue: HonkboxQueue;
  readonly imageOps?: { readonly ops: readonly string[] };
  readonly tools?: {
    readonly toolChoiceHonored: readonly string[];
    readonly toolChoiceClamped: readonly string[];
    readonly toolChoiceNamedFunctionClamped: boolean;
    readonly parallelToolCalls: boolean;
  };
  readonly recognition?: { readonly barcode: boolean; readonly ocr: boolean };
  readonly externalTools?: {
    readonly tools: readonly {
      readonly id: string;
      readonly version?: string;
      readonly capabilities: readonly string[];
      readonly devices: readonly string[];
      readonly available: boolean;
      readonly unavailable?: string;
    }[];
  };
  readonly storage: { readonly dataDirPresent: boolean };
  readonly openapi: string;
  readonly models: string;
}

/** Why a probe concluded the server is not usable. */
export type HonkboxProbeReason =
  | "invalid-base-url"
  | "unreachable"
  | "http-error"
  | "malformed-response";

/** A server that answered with a usable capabilities document. */
export interface HonkboxProbeSuccess {
  readonly ok: true;
  readonly capabilities: HonkboxCapabilities;
  /** False on an unknown major `api_version` — flags degrade to absent. */
  readonly supported: boolean;
  readonly warning?: string;
  readonly latencyMs: number;
  /** True when served from the cache (no new probe). */
  readonly cached?: boolean;
}

/** A server that could not be probed, with a structured reason. */
export interface HonkboxProbeFailure {
  readonly ok: false;
  readonly reason: HonkboxProbeReason;
  readonly detail: string;
  readonly httpStatus?: number;
}

/** Probe outcome for one honkbox instance. */
export type HonkboxProbeResult = HonkboxProbeSuccess | HonkboxProbeFailure;

/** Options for {@link probeHonkboxCapabilities}. */
export interface ProbeHonkboxOptions {
  /** Provider base URL including `/v1` (trailing slashes tolerated). */
  readonly baseUrl: string;
  /** Bearer credential for the probe (same layer as every other route). */
  readonly apiKey?: string;
  /** Probe deadline in ms (default {@link DEFAULT_HONKBOX_PROBE_TIMEOUT_MS}). */
  readonly timeoutMs?: number;
}

/** Options for {@link getHonkboxCapabilities}. */
export interface GetHonkboxCapabilitiesOptions extends ProbeHonkboxOptions {
  /** Force a fresh probe instead of reusing a cached descriptor. */
  readonly refresh?: boolean;
}

/** Who admits GPU work for a honkbox dispatch — exactly one side, never both. */
export type HonkboxAdmissionOwner = "honkbox" | "loop-lore";

/** */
export interface HonkboxAdmissionDecision {
  readonly owner: HonkboxAdmissionOwner;
  /** True when loop-lore must NOT take its own scheduler/GPU slot. */
  readonly localAdmissionDenied: boolean;
  readonly gpuSlots: number;
}

/** Raised when both sides would admit the same GPU workload. */
export class HonkboxAdmissionError extends Error {
  /** */
  constructor(message: string,) {
    super(message,);
    this.name = "HonkboxAdmissionError";
  }
}

/** Rule: a non-empty resource ledger (`queue.gpuSlots > 0`) means honkbox
 * owns GPU admission; otherwise the loop-lore scheduler owns it. Never both.
 * @param capabilities - the probed descriptor, or undefined when unavailable
 * @returns the single owner and whether local admission is denied
 */
export function honkboxAdmissionDecision(
  capabilities: HonkboxCapabilities | undefined,
): HonkboxAdmissionDecision {
  const gpuSlots = capabilities?.queue.gpuSlots ?? 0;
  if (gpuSlots > 0) {
    return { owner: "honkbox", localAdmissionDenied: true, gpuSlots, };
  }

  return { owner: "loop-lore", localAdmissionDenied: false, gpuSlots: 0, };
}

/** Reject a dispatch that would double-admit a GPU workload.
 * @param decision - the resolved admission owner
 * @param localAdmission - whether the caller already holds a loop-lore slot
 * @throws {HonkboxAdmissionError} when honkbox owns admission and a local slot is held
 * @returns {void}
 */
export function assertNoDoubleGpuAdmission(
  decision: HonkboxAdmissionDecision,
  localAdmission: boolean,
): void {
  if (decision.localAdmissionDenied && localAdmission) {
    throw new HonkboxAdmissionError(
      "honkbox ledger owns GPU admission; the loop-lore scheduler must not admit this dispatch",
    );
  }
}

/** @param baseUrl - raw provider base URL
 * @returns the normalized `/v1`-inclusive base URL, or "" when blank
 */
export function normalizeHonkboxBaseUrl(baseUrl: string,): string {
  return baseUrl.trim().replace(/\/+$/, "",);
}

/** Cache key: base URL plus a credential fingerprint (never the raw key).
 * @param baseUrl - provider base URL
 * @param apiKey - optional bearer credential
 * @returns the cache key
 */
export function honkboxCacheKey(baseUrl: string, apiKey?: string,): string {
  const fingerprint = apiKey
    ? createHash("sha256",).update(apiKey,).digest("hex",).slice(0, 16,)
    : "anonymous";

  return `${normalizeHonkboxBaseUrl(baseUrl,)}\u0000${fingerprint}`;
}

interface CachedEntry {
  readonly capabilities: HonkboxCapabilities;
  readonly supported: boolean;
  readonly warning?: string;
}

const cache = new Map<string, CachedEntry>();

/** Clear the process-wide capability cache (tests and provider rebuilds).
 * @returns {void}
 */
export function clearHonkboxCapabilitiesCache(): void {
  cache.clear();
}

/** Return the cached descriptor for a base URL/credential pair, if any.
 * @param baseUrl - provider base URL
 * @param apiKey - optional bearer credential
 * @returns the cached probe success, or undefined
 */
export function peekHonkboxCapabilities(
  baseUrl: string,
  apiKey?: string,
): HonkboxProbeSuccess | undefined {
  const hit = cache.get(honkboxCacheKey(baseUrl, apiKey,),);
  if (!hit) { return undefined; }
  return {
    ok: true,
    capabilities: hit.capabilities,
    supported: hit.supported,
    ...(hit.warning ? { warning: hit.warning, } : {}),
    latencyMs: 0,
    cached: true,
  };
}

/**
 * Probe one honkbox instance's capabilities endpoint. Never throws — every
 * transport, HTTP, parse and version outcome maps onto {@link HonkboxProbeResult}.
 * @param opts - base URL, optional bearer key and deadline
 * @returns the probe outcome
 */
export async function probeHonkboxCapabilities(
  opts: ProbeHonkboxOptions,
): Promise<HonkboxProbeResult> {
  const base = normalizeHonkboxBaseUrl(opts.baseUrl,);
  if (!base) {
    return { ok: false, reason: "invalid-base-url", detail: "baseUrl must not be blank", };
  }

  const url = `${base}${HONKBOX_CAPABILITIES_PATH}`;
  const start = Date.now();
  const result = await safeFetch<unknown>(url, {
    timeout: opts.timeoutMs ?? DEFAULT_HONKBOX_PROBE_TIMEOUT_MS,
    handle401: false,
    ...(opts.apiKey
      ? { headers: { Authorization: `Bearer ${opts.apiKey}`, }, }
      : {}),
  },);

  if (!result.ok) {
    if (result.status === undefined) {
      return { ok: false, reason: "unreachable", detail: result.error.message, };
    }

    if (result.status < 200 || result.status >= 300) {
      return {
        ok: false,
        reason: "http-error",
        detail: `capabilities request answered HTTP ${String(result.status,)}: ${result.error.message}`,
        httpStatus: result.status,
      };
    }

    return {
      ok: false,
      reason: "malformed-response",
      detail: result.error.message,
      httpStatus: result.status,
    };
  }

  const parsed = parseHonkboxCapabilities(result.data,);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: "malformed-response",
      detail: parsed.error,
      httpStatus: result.status,
    };
  }

  const capabilities = parsed.capabilities;
  const major = Number.parseInt(capabilities.apiVersion.replace(/^v/, "",), 10,);
  if (!Number.isFinite(major,) || major !== HONKBOX_SUPPORTED_API_MAJOR) {
    const warning = `unsupported honkbox api_version "${capabilities.apiVersion}" (expected major ${
      String(HONKBOX_SUPPORTED_API_MAJOR,)
    })`;

    getChildLogger("integrations/honkbox",)?.warn(warning, { url, },);
    return {
      ok: true,
      capabilities,
      supported: false,
      warning,
      latencyMs: Date.now() - start,
    };
  }

  getChildLogger("integrations/honkbox",)?.info("honkbox capabilities probed", {
    url,
    apiVersion: capabilities.apiVersion,
    serverVersion: capabilities.server.version,
    gpuSlots: capabilities.queue.gpuSlots,
  },);

  return { ok: true, capabilities, supported: true, latencyMs: Date.now() - start, };
}

/**
 * Cached probe: one GET per setup, another only on an explicit refresh.
 * A failed refresh drops the stale entry so the next call re-probes.
 * @param opts - base URL, credential, deadline and optional `refresh`
 * @returns the probe outcome (cached successes carry `cached: true`)
 */
export async function getHonkboxCapabilities(
  opts: GetHonkboxCapabilitiesOptions,
): Promise<HonkboxProbeResult> {
  const key = honkboxCacheKey(opts.baseUrl, opts.apiKey,);
  if (!opts.refresh) {
    const hit = peekHonkboxCapabilities(opts.baseUrl, opts.apiKey,);
    if (hit) { return hit; }
  }

  const probed = await probeHonkboxCapabilities(opts,);
  if (probed.ok) {
    cache.set(key, {
      capabilities: probed.capabilities,
      supported: probed.supported,
      ...(probed.warning ? { warning: probed.warning, } : {}),
    },);
  } else {
    cache.delete(key,);
  }

  return probed;
}

/** Force a fresh probe of one honkbox instance.
 * @param opts - base URL, credential and optional deadline
 * @returns the probe outcome
 */
export async function refreshHonkboxCapabilities(
  opts: ProbeHonkboxOptions,
): Promise<HonkboxProbeResult> {
  return await getHonkboxCapabilities({ ...opts, refresh: true, },);
}

/**
 * Feature gate: false for an unreachable/unsupported server or an absent
 * flag. Object-valued optional sections (`imageOps`, `tools`, `recognition`,
 * `audioCpp`) count as present only when the probe actually advertised them.
 * @param result - the cached or fresh probe outcome
 * @param key - the capability key to test
 * @returns whether the capability is enabled
 */
export function isHonkboxFeatureEnabled(
  result: HonkboxProbeResult | undefined,
  key: HonkboxFeatureKey,
): boolean {
  if (!result?.ok || !result.supported) { return false; }
  const { capabilities, } = result;
  switch (key) {
    case "vision":
      return capabilities.features.vision.built;
    case "controlnet":
      return capabilities.features.controlnet.available;
    case "imageOps":
      return capabilities.imageOps !== undefined;
    case "tools":
      return capabilities.tools !== undefined;
    case "recognition":
      return capabilities.recognition !== undefined;
    case "lora":
      return capabilities.features.lora;
    case "video":
      return capabilities.features.video;
    case "decisions":
      return capabilities.features.decisions === true;
    case "audio_cpp":
      return capabilities.features.audioCpp?.built === true;
    case "jobs":
      return capabilities.features.jobs;
    case "events":
      return capabilities.features.events;
    case "vad":
      return capabilities.features.vad;
    case "experimentalAshSd":
      return capabilities.features.experimentalAshSd;
    case "blender":
      return capabilities.features.blender;
    case "artifactDelivery":
      return capabilities.features.artifactDelivery;
    case "rerank":
      return capabilities.features.rerank === true;
    case "python_sidecar":
      return capabilities.features.pythonSidecar === true;
    case "texture_postprocess":
      return capabilities.features.texturePostprocess === true;
    case "fizgig":
      return capabilities.features.fizgig === true;
    case "residency_control":
      return capabilities.features.residencyControl === true;
  }
}

/** External-tool gate: usable supported probe, available tool, matching id
 * and exact capability when supplied. Never throws.
 * @param probe - cached or fresh probe outcome
 * @param toolId - external tool id (e.g. `"blender"`)
 * @param capability - optional exact capability the tool must advertise
 * @returns whether the tool is available
 */
export function isHonkboxExternalToolAvailable(
  probe: HonkboxProbeResult | undefined,
  toolId: string,
  capability?: string,
): boolean {
  if (!probe?.ok || !probe.supported) { return false; }
  try {
    const tools = probe.capabilities.externalTools?.tools ?? [];
    return tools.some((tool,) =>
      tool.available === true &&
      tool.id === toolId &&
      (capability === undefined || tool.capabilities.includes(capability,))
    );
  } catch {
    return false;
  }
}

/**
 * Defensively parse a capabilities document. Every section defaults to an
 * empty/zero shape; only a non-object body or a missing `api_version` fails.
 * @param data - parsed JSON body of `GET {baseUrl}/capabilities`
 * @returns the descriptor or a parse error
 */
export function parseHonkboxCapabilities(
  data: unknown,
): { ok: true; capabilities: HonkboxCapabilities } | { ok: false; error: string } {
  if (typeof data !== "object" || data === null || Array.isArray(data,)) {
    return { ok: false, error: "capabilities response is not a JSON object", };
  }

  const doc = data as Record<string, unknown>;
  const apiVersion = asString(doc.api_version,);
  if (!apiVersion) {
    return { ok: false, error: "capabilities response has no api_version", };
  }

  const server = asObject(doc.server,);
  const features = asObject(doc.features,);
  const formats = asObject(doc.formats,);
  const limits = asObject(formats?.limits,);
  const compression = asObject(limits?.output_compression,);
  const auth = asObject(doc.auth,);
  const queue = asObject(doc.queue,);
  const vision = asObject(features?.vision,);
  const controlnet = asObject(features?.controlnet,);
  const audioCpp = asObject(features?.audio_cpp,);
  const imageOps = asObject(doc.image_ops,);
  const tools = asObject(doc.tools,);
  const recognition = asObject(doc.recognition,);
  const externalTools = asObject(doc.external_tools,);
  const storage = asObject(doc.storage,);
  const scopes = asObject(doc.scopes,);

  return {
    ok: true,
    capabilities: {
      apiVersion,
      server: {
        name: asString(server?.name,) ?? "honkbox",
        version: asString(server?.version,) ?? "",
      },
      features: {
        vision: {
          built: asBool(vision?.built,),
          models: asNumber(vision?.models,),
        },
        controlnet: {
          available: asBool(controlnet?.available,),
          models: asNumber(controlnet?.models,),
        },
        lora: asBool(features?.lora,),
        video: asBool(features?.video,),
        decisions: asBool(features?.decisions,),
        ...(audioCpp
          ? {
            audioCpp: {
              built: asBool(audioCpp.built,),
              sttFamilies: asStringArray(audioCpp.stt_families,),
              ttsFamilies: asStringArray(audioCpp.tts_families,),
            },
          }
          : {}),
        jobs: asBool(features?.jobs,),
        events: asBool(features?.events,),
        vad: asBool(features?.vad,),
        experimentalAshSd: asBool(features?.experimental_ash_sd,),
        blender: asBool(features?.blender,),
        artifactDelivery: asBool(features?.artifact_delivery,),
        rerank: asBool(features?.rerank,),
        pythonSidecar: asBool(features?.python_sidecar,),
        texturePostprocess: asBool(features?.texture_postprocess,),
        fizgig: asBool(features?.fizgig,),
        residencyControl: asBool(features?.residency_control,),
      },
      formats: {
        read: asStringArray(formats?.read,),
        write: asObjectArray(formats?.write,).map((row,) => ({
          format: asString(row.format,) ?? "",
          compression: asBool(row.compression,),
        })),
        limits: {
          outputCompression: {
            min: asNumber(compression?.min,),
            max: asNumber(compression?.max,),
            appliesTo: asString(compression?.applies_to,) ?? "",
          },
          bodyBytes: asNumber(limits?.body_bytes,),
        },
      },
      auth: { mode: asString(auth?.mode,) ?? "none", },
      ...(scopes
        ? {
          scopes: {
            enabled: asBool(scopes.enabled,),
            consumers: asStringArray(scopes.scopes,),
          },
        }
        : {}),
      queue: {
        gpuSlots: asNumber(queue?.gpu_slots,),
        queueWaitSecs: asNumber(queue?.queue_wait_secs,),
        retryAfterSecs: asNumber(queue?.retry_after_secs,),
        kinds: asObjectArray(queue?.kinds,).map((row,) => ({
          kind: asString(row.kind,) ?? "",
          queueCap: asNumber(row.queue_cap,),
          ttlSecs: asNumber(row.ttl_secs,),
        })),
      },
      ...(imageOps ? { imageOps: { ops: asStringArray(imageOps.ops,), }, } : {}),
      ...(tools
        ? {
          tools: {
            toolChoiceHonored: asStringArray(tools.tool_choice_honored,),
            toolChoiceClamped: asStringArray(tools.tool_choice_clamped,),
            toolChoiceNamedFunctionClamped: asBool(tools.tool_choice_named_function_clamped,),
            parallelToolCalls: asBool(tools.parallel_tool_calls,),
          },
        }
        : {}),
      ...(recognition
        ? {
          recognition: {
            barcode: asBool(recognition.barcode,),
            ocr: asBool(recognition.ocr,),
          },
        }
        : {}),
      ...(externalTools
        ? {
          externalTools: {
            tools: asObjectArray(externalTools.tools,).map((row,) => {
              const version = asString(row.version,);
              const unavailable = asString(row.unavailable,);
              return {
                id: asString(row.id,) ?? "",
                ...(version ? { version, } : {}),
                capabilities: asStringArray(row.capabilities,),
                devices: asStringArray(row.devices,),
                available: asBool(row.available,),
                ...(unavailable ? { unavailable, } : {}),
              };
            },),
          },
        }
        : {}),
      storage: { dataDirPresent: asBool(storage?.data_dir_present,), },
      openapi: asString(doc.openapi,) ?? "",
      models: asString(doc.models,) ?? "",
    },
  };
}

/** @param value - unknown JSON value
 * @returns an object view, or undefined
 */
function asObject(value: unknown,): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value,)
    ? value as Record<string, unknown>
    : undefined;
}

/** @param value - unknown JSON value
 * @returns a non-empty string, or undefined
 */
function asString(value: unknown,): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** @param value - unknown JSON value
 * @returns a boolean (absent/non-boolean is false)
 */
function asBool(value: unknown,): boolean {
  return value === true;
}

/** @param value - unknown JSON value
 * @returns a finite number (absent/non-number is 0)
 */
function asNumber(value: unknown,): number {
  return typeof value === "number" && Number.isFinite(value,) ? value : 0;
}

/** @param value - unknown JSON value
 * @returns an array of non-empty strings
 */
function asStringArray(value: unknown,): string[] {
  if (!Array.isArray(value,)) { return []; }
  const out: string[] = [];
  for (const entry of value) {
    const text = asString(entry,);
    if (text) { out.push(text,); }
  }

  return out;
}

/** @param value - unknown JSON value
 * @returns an array of object views
 */
function asObjectArray(value: unknown,): Record<string, unknown>[] {
  if (!Array.isArray(value,)) { return []; }
  const out: Record<string, unknown>[] = [];
  for (const entry of value) {
    const obj = asObject(entry,);
    if (obj) { out.push(obj,); }
  }

  return out;
}
