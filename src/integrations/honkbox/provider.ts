// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Honkbox Custom-provider wiring.
 *
 * Honkbox is reached through the EXISTING OpenAI-compatible adapters: the
 * chat turn uses `OpenAiCompatibleProvider` (`{baseUrl}/chat/completions`)
 * and the image job uses the `openai` image engine family
 * (`{baseUrl}/images/generations`). No new provider family or HTTP adapter is
 * introduced. Job observation and cancel are thin clients over the landed
 * `/v1/jobs` and `/v1/events` routes.
 *
 * GPU admission has exactly one owner: a non-empty honkbox resource ledger
 * (`queue.gpuSlots > 0`) means honkbox admits and loop-lore must not hold a
 * scheduler slot; otherwise the loop-lore scheduler owns admission. Both
 * dispatch paths assert that boundary before doing any work.
 */

import type { ImageProviderConfig, ProviderInstanceConfig, } from "../../config/schema";
import {
  generateImages,
  type ImageGenOptions,
  type ImageGenOutcome,
} from "../../generation/image-engine";
import {
  OpenAiCompatibleProvider,
} from "../../generation/providers/openai-compatible";
import {
  getProvider,
  registerProvider,
  unregisterProvider,
} from "../../generation/providers/registry";
import type {
  GenerateRequest,
  GenerateResponse,
} from "../../generation/providers/types";
import { getChildLogger, } from "../../logger";
import { safeFetch, } from "../../utils";
import {
  assertNoDoubleGpuAdmission,
  getHonkboxCapabilities,
  type HonkboxAdmissionDecision,
  honkboxAdmissionDecision,
  type HonkboxFeatureKey,
  type HonkboxProbeResult,
  isHonkboxFeatureEnabled,
  normalizeHonkboxBaseUrl,
  type ProbeHonkboxOptions,
} from "./capabilities";

/** Lifecycle event stream, relative to the `/v1`-inclusive base URL. */
const HONKBOX_EVENTS_PATH = "/events";

/** Options for {@link honkboxCustomProviderConfig}. */
export interface HonkboxCustomProviderOptions extends ProbeHonkboxOptions {
  /** Registry instance name (default `"honkbox"`). */
  readonly name?: string;
  /** Human-readable label. */
  readonly label?: string;
  /** Default chat model id. */
  readonly model: string;
  /** Connection timeout in ms (default 60_000). */
  readonly timeout?: number;
  /** Retry budget (default 2). */
  readonly retries?: number;
  /** Operator-approved remote hosts (SSRF validator). */
  readonly allowedHosts?: string[];
}

/** @param baseUrl - raw honkbox base URL, with or without a trailing `/v1`
 * @returns the `/v1`-inclusive base URL the LLM adapter appends paths to
 */
export function honkboxChatBaseUrl(baseUrl: string,): string {
  const normalized = normalizeHonkboxBaseUrl(baseUrl,);
  if (normalized.endsWith("/v1",)) { return normalized; }
  return `${normalized}/v1`;
}

/** @param baseUrl - the `/v1`-inclusive honkbox base URL
 * @returns the origin base URL the existing openai image engine expects
 */
export function honkboxImageBaseUrl(baseUrl: string,): string {
  const normalized = normalizeHonkboxBaseUrl(baseUrl,);
  return normalized.endsWith("/v1",) ? normalized.slice(0, -3,) : normalized;
}

/** Build the provider config for one honkbox Custom provider instance.
 * @param opts - endpoint, credential, model and optional tuning
 * @returns a config consumable by `OpenAiCompatibleProvider`
 */
export function honkboxCustomProviderConfig(
  opts: HonkboxCustomProviderOptions,
): ProviderInstanceConfig {
  return {
    name: opts.name ?? "honkbox",
    label: opts.label ?? "Honkbox (Custom)",
    baseUrl: honkboxChatBaseUrl(opts.baseUrl,),
    ...(opts.apiKey ? { apiKey: opts.apiKey, } : {}),
    model: opts.model,
    timeout: opts.timeout ?? 60_000,
    retries: opts.retries ?? 2,
    allowUserApiKey: true,
    ...(opts.allowedHosts ? { allowedHosts: opts.allowedHosts, } : {}),
    models: {},
  };
}

/** Raised when a required honkbox capability is unavailable or degraded. */
export class HonkboxCapabilityUnavailableError extends Error {
  /** */
  constructor(message: string,) {
    super(message,);
    this.name = "HonkboxCapabilityUnavailableError";
  }
}

/** @param probe - the probe outcome, or undefined when no setup probe ran
 * @returns the probed descriptor, or undefined for an unavailable/degraded probe
 */
function usableCapabilities(probe: HonkboxProbeResult | undefined,) {
  return probe?.ok && probe.supported ? probe.capabilities : undefined;
}

/** Guard one dispatch: no double admission, and a usable live contract.
 * @param probe - the setup probe outcome
 * @param localAdmission - whether the caller holds a loop-lore scheduler slot
 * @param required - extra capability flags this dispatch needs
 * @returns the resolved admission decision
 * @throws {HonkboxAdmissionError} on double GPU admission
 * @throws {HonkboxCapabilityUnavailableError} on missing capability
 */
function assertDispatchable(
  probe: HonkboxProbeResult | undefined,
  localAdmission: boolean,
  required: readonly HonkboxFeatureKey[],
): HonkboxAdmissionDecision {
  const capabilities = usableCapabilities(probe,);
  const decision = honkboxAdmissionDecision(capabilities,);
  assertNoDoubleGpuAdmission(decision, localAdmission,);

  if (!probe?.ok) {
    throw new HonkboxCapabilityUnavailableError(
      `honkbox capabilities unavailable: ${probe?.reason ?? "not probed"} — ${probe?.detail ?? "run setup first"}`,
    );
  }

  if (!probe.supported) {
    throw new HonkboxCapabilityUnavailableError(
      `honkbox contract degraded: ${probe.warning ?? "unsupported api_version"}`,
    );
  }

  for (const key of required) {
    if (!isHonkboxFeatureEnabled(probe, key,)) {
      throw new HonkboxCapabilityUnavailableError(`honkbox capability "${key}" is not available`,);
    }
  }

  return decision;
}

/** Shared dispatch parameters for both honkbox paths. */
export interface HonkboxDispatchOptions {
  /** Config from {@link honkboxCustomProviderConfig}. */
  readonly config: ProviderInstanceConfig;
  /** Cached/fresh probe from provider setup; absent means no live contract. */
  readonly probe?: HonkboxProbeResult;
  /** True when the caller already holds a loop-lore scheduler slot. */
  readonly localAdmission?: boolean;
}

/** Probe once and register the Custom provider in the global registry.
 * A mismatch or an unreachable server warns but never breaks boot — the
 * provider is still registered and dispatches fail closed via the probe.
 * @param opts - endpoint, credential, model and optional tuning
 * @returns the config, provider, probe outcome and admission decision
 */
export async function setupHonkboxCustomProvider(
  opts: HonkboxCustomProviderOptions,
): Promise<{
  config: ProviderInstanceConfig;
  provider: OpenAiCompatibleProvider;
  probe: HonkboxProbeResult;
  admission: HonkboxAdmissionDecision;
}> {
  const config = honkboxCustomProviderConfig(opts,);
  const probe = await getHonkboxCapabilities({
    baseUrl: config.baseUrl,
    ...(opts.apiKey ? { apiKey: opts.apiKey, } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs, } : {}),
  },);

  if (!probe.ok) {
    getChildLogger("integrations/honkbox",)?.warn("honkbox provider registered without live capabilities", {
      name: config.name,
      reason: probe.reason,
      detail: probe.detail,
    },);
  }

  if (probe.ok && !probe.supported) {
    getChildLogger("integrations/honkbox",)?.warn("honkbox provider registered with degraded contract", {
      name: config.name,
      warning: probe.warning,
    },);
  }

  if (getProvider(config.name,)) { unregisterProvider(config.name,); }
  const provider = new OpenAiCompatibleProvider(config,);
  registerProvider(config.name, provider,);

  return {
    config,
    provider,
    probe,
    admission: honkboxAdmissionDecision(usableCapabilities(probe,),),
  };
}

/** Complete one honkbox chat turn through the existing OpenAI-compatible
 * adapter (`{baseUrl}/chat/completions`).
 * @param opts - config, setup probe and admission state
 * @param request - the generation request (model, messages, params)
 * @returns the single chat turn response
 */
export async function runHonkboxChatTurn(
  opts: HonkboxDispatchOptions,
  request: GenerateRequest,
): Promise<GenerateResponse> {
  assertDispatchable(opts.probe, opts.localAdmission ?? false, [],);
  const provider = new OpenAiCompatibleProvider(opts.config,);
  return await provider.complete(request,);
}

/** Submit one honkbox image job through the existing `openai` image engine
 * (`{baseUrl}/images/generations`). `jobs` capability is required so the job
 * can be observed through `/v1/jobs`.
 * @param opts - config, setup probe and admission state
 * @param imageOpts - prompt, size and output format
 * @returns the image generation outcome
 */
export async function runHonkboxImageJob(
  opts: HonkboxDispatchOptions,
  imageOpts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  assertDispatchable(opts.probe, opts.localAdmission ?? false, ["jobs",],);
  const imageConfig: ImageProviderConfig = {
    name: opts.config.name,
    label: opts.config.label,
    baseUrl: honkboxImageBaseUrl(opts.config.baseUrl,),
    apiFamily: "openai",
    ...(opts.config.apiKey ? { apiKey: opts.config.apiKey, } : {}),
    purpose: "generate",
    defaults: {
      width: 1024,
      height: 1024,
      steps: 20,
      cfgScale: 7,
      sampler: "euler",
    },
    timeout: opts.config.timeout,
    generationTimeout: opts.config.timeout,
  };

  return await generateImages(imageConfig, imageOpts,);
}

/** List honkbox jobs (`GET {baseUrl}/jobs`) for run observability.
 * @param opts - config, setup probe and admission state
 * @returns the job list as returned by the server
 */
export async function getHonkboxJobs(
  opts: HonkboxDispatchOptions,
): Promise<unknown> {
  assertDispatchable(opts.probe, opts.localAdmission ?? false, ["jobs",],);
  const result = await safeFetch<unknown>(
    `${normalizeHonkboxBaseUrl(opts.config.baseUrl,)}/jobs`,
    {
      handle401: false,
      ...(opts.config.apiKey
        ? { headers: { Authorization: `Bearer ${opts.config.apiKey}`, }, }
        : {}),
    },
  );

  if (!result.ok) {
    throw new HonkboxCapabilityUnavailableError(`honkbox jobs request failed: ${result.error.message}`,);
  }

  return result.data;
}

/** Cancel one honkbox job mid-run (`POST {baseUrl}/jobs/{id}/cancel`).
 * @param opts - config, setup probe and admission state
 * @param jobId - the job id from `/v1/jobs`
 * @returns true when the server accepted the cancel
 */
export async function cancelHonkboxJob(
  opts: HonkboxDispatchOptions,
  jobId: string,
): Promise<boolean> {
  assertDispatchable(opts.probe, opts.localAdmission ?? false, ["jobs",],);
  const result = await safeFetch<unknown>(
    `${normalizeHonkboxBaseUrl(opts.config.baseUrl,)}/jobs/${encodeURIComponent(jobId,)}/cancel`,
    {
      method: "POST",
      handle401: false,
      ...(opts.config.apiKey
        ? { headers: { Authorization: `Bearer ${opts.config.apiKey}`, }, }
        : {}),
    },
  );

  if (!result.ok) {
    throw new HonkboxCapabilityUnavailableError(`honkbox job cancel failed: ${result.error.message}`,);
  }

  return true;
}

/** Open the honkbox SSE lifecycle feed (`GET {baseUrl}/events`).
 * @param opts - config, setup probe and admission state
 * @returns the live response whose body streams job state
 */
export async function openHonkboxEventStream(
  opts: HonkboxDispatchOptions,
): Promise<Response> {
  assertDispatchable(opts.probe, opts.localAdmission ?? false, ["events",],);
  const result = await safeFetch<Response>(
    `${normalizeHonkboxBaseUrl(opts.config.baseUrl,)}${HONKBOX_EVENTS_PATH}`,
    {
      stream: true,
      handle401: false,
      ...(opts.config.apiKey
        ? { headers: { Authorization: `Bearer ${opts.config.apiKey}`, }, }
        : {}),
    },
  );

  if (!result.ok) {
    throw new HonkboxCapabilityUnavailableError(`honkbox events request failed: ${result.error.message}`,);
  }

  return result.data;
}
