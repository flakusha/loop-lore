// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { listSdProviders, } from "../../config/schema";
import { validateProviderUrl, } from "../../utils/url-validation";
import { generateComfyUI, } from "./comfyui";
import { probeComfyUI, } from "./comfyui-discovery";
import { failure, } from "./helpers";
import { generateOpenAI, } from "./openai";
import { sdServerAuthHeaders, } from "./sd-server-jobs";
import { generateSDAPI, } from "./sdapi";
import { generateSDCPP, } from "./sdcpp";
import { DEFAULT_SDCPP_PROBE_TIMEOUT_MS, probeSdCpp, } from "./sdcpp-discovery";
import type { FailoverAttempt, ImageGenOptions, ImageGenOutcome, } from "./types";

// ── Public API re-exports ──────────────────────────────────
export type {
  ImageGenFailure,
  ImageGenOptions,
  ImageGenOutcome,
  ImageGenSuccess,
} from "./types";

/**
 * Generate images using the configured provider.
 * @param sdConfig - Resolved image provider config
 * @param opts - Generation request inputs
 * @returns A discriminated outcome; never throws on provider failures
 */
export async function generateImages(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const validated = validateProviderUrl(sdConfig.baseUrl,);
  if (!validated.ok) {
    return failure(`Invalid image provider URL: ${validated.error}`, 400,);
  }

  switch (sdConfig.apiFamily) {
    case "openai": {
      return generateOpenAI(sdConfig, opts,);
    }

    case "sdapi": {
      return generateSDAPI(sdConfig, opts,);
    }

    case "sdcpp": {
      return generateSDCPP(sdConfig, opts,);
    }

    case "comfyui": {
      return generateComfyUI(sdConfig, opts,);
    }

    default: {
      return failure(
        `Image gen API family "${
          String(sdConfig.apiFamily,)
        }" not supported. Use "openai", "sdapi", "sdcpp", or "comfyui".`,
        501,
      );
    }
  }
}

/** Resolver for a provider's BYO API key, keyed by provider NAME — a key
 * stored for provider A is never handed to provider B during failover. */
export type SdApiKeyResolver = (providerName: string,) => Promise<string | undefined>;

/** Probe timeout ceiling for the failover discovery gate — the healthy path
 * pays one cheap GET, the dead path never hangs longer than this. */
const FAILOVER_PROBE_TIMEOUT_MS = DEFAULT_SDCPP_PROBE_TIMEOUT_MS;

/**
 * Discovery gate for one sd.cpp failover candidate.
 * @param candidate - the sd.cpp provider candidate
 * @param apiKey - resolved key for this candidate
 * @returns the skip attempt when the instance is unreachable, else null
 */
export async function sdCppSkipAttempt(
  candidate: ImageProviderConfig,
  apiKey: string | undefined,
): Promise<FailoverAttempt | null> {
  const probe = await probeSdCpp({
    baseUrl: candidate.baseUrl,
    timeoutMs: Math.min(candidate.timeout, FAILOVER_PROBE_TIMEOUT_MS,),
    headers: sdServerAuthHeaders(apiKey ?? candidate.apiKey,),
  },);

  if (probe.reachable) { return null; }

  return skipAttemptFor(candidate.name, probe,);
}

/**
 * Discovery gate for one ComfyUI failover candidate — the same mechanics as
 * the sd.cpp gate, against the native `/system_stats` readiness endpoint.
 * @param candidate - the ComfyUI provider candidate
 * @param apiKey - resolved key for this candidate
 * @returns the skip attempt when the instance is unreachable, else null
 */
export async function comfyUiSkipAttempt(
  candidate: ImageProviderConfig,
  apiKey: string | undefined,
): Promise<FailoverAttempt | null> {
  const probe = await probeComfyUI({
    baseUrl: candidate.baseUrl,
    timeoutMs: Math.min(candidate.timeout, FAILOVER_PROBE_TIMEOUT_MS,),
    headers: sdServerAuthHeaders(apiKey ?? candidate.apiKey,),
  },);

  if (probe.reachable) { return null; }

  return skipAttemptFor(candidate.name, probe,);
}

/**
 * @param providerName - the candidate's instance name
 * @param probe - the unreachable probe outcome (sd.cpp or ComfyUI shape)
 * @returns the structured skip attempt
 */
function skipAttemptFor(
  providerName: string,
  probe: { reason: string; detail: string; httpStatus?: number; reachable: false },
): FailoverAttempt {
  return {
    provider: providerName,
    outcome: "skipped",
    reason: `${probe.reason}: ${probe.detail}`,
    ...(probe.httpStatus !== undefined ? { status: probe.httpStatus, } : {}),
  };
}

/**
 * Run one candidate's generation. A provider that THROWS (e.g. LoRA discovery
 * against a dead backend) is converted to a failure outcome so the failover
 * loop never aborts hard; failures and throws are recorded on `attempts`.
 * @param candidate - the provider candidate
 * @param opts - request inputs with the per-candidate key merged in
 * @param attempts - the loop's attempt record (mutated)
 * @returns the candidate's outcome
 */
async function attemptCandidate(
  candidate: ImageProviderConfig,
  opts: ImageGenOptions,
  attempts: FailoverAttempt[],
): Promise<ImageGenOutcome> {
  try {
    const outcome = await generateImages(candidate, opts,);
    if (!outcome.ok) {
      attempts.push({ provider: candidate.name, outcome: "failed", reason: outcome.error, status: outcome.status, },);
    }

    return outcome;
  } catch (error) {
    const outcome = failure(error instanceof Error ? error.message : String(error,), 502,);
    attempts.push({ provider: candidate.name, outcome: "failed", reason: outcome.error, status: 502, },);
    return outcome;
  }
}

/**
 * Generate images with cross-backend failover (ordered fallback list).
 *
 * Candidates are ordered by `purpose` fit (exact → both → rest). The first
 * backend returning a success outcome wins; each attempt gets its own BYO
 * key resolved by provider name. A caller-resolved `opts.apiKey` is honored
 * on the first candidate only — per-provider resolution takes over after a
 * failed attempt so a key for backend A never bills backend B.
 *
 * sd.cpp and ComfyUI candidates pass a discovery gate first: an instance
 * whose native probe (`/sdcpp/v1/capabilities`, `/system_stats`) fails is
 * skipped with a structured reason instead of paying a doomed generation
 * attempt. Every candidate's skip or failure is recorded on the returned
 * failure outcome (`attempts`).
 * @param providers - All configured SD providers (may be undefined)
 * @param purpose - What the provider will be used for
 * @param opts - Generation request inputs (no per-attempt key needed)
 * @param resolveApiKey - Optional BYO key resolver keyed by provider name
 * @returns A discriminated outcome; the LAST candidate's failure — carrying
 * the per-candidate `attempts` record — when every backend fails or is skipped
 */
/**
 * Discovery gate for one local-engine failover candidate (sd.cpp or ComfyUI).
 * @param candidate - the provider candidate
 * @param apiKey - resolved key for this candidate
 * @returns the skip attempt when the instance is unreachable, else null
 */
async function discoverySkipAttempt(
  candidate: ImageProviderConfig,
  apiKey: string | undefined,
): Promise<FailoverAttempt | null> {
  if (candidate.apiFamily === "sdcpp") { return sdCppSkipAttempt(candidate, apiKey,); }
  if (candidate.apiFamily === "comfyui") { return comfyUiSkipAttempt(candidate, apiKey,); }
  return null;
}

export async function generateImagesWithFailover(
  providers: ImageProviderConfig[] | undefined,
  purpose: "generate" | "edit",
  opts: ImageGenOptions,
  resolveApiKey?: SdApiKeyResolver,
): Promise<ImageGenOutcome> {
  const candidates = listSdProviders(providers, purpose,);
  if (candidates.length === 0) {
    return failure(
      "No image generation provider configured. Set config.generation.providers.sd in your config file.",
      501,
    );
  }

  const attempts: FailoverAttempt[] = [];
  let last: ImageGenOutcome | undefined;
  for (const [i, candidate,] of candidates.entries()) {
    const apiKey = i === 0
      ? opts.apiKey ?? await resolveApiKey?.(candidate.name,)
      : await resolveApiKey?.(candidate.name,);

    // Local-engine discovery gate (TASK-1-0-0-gap-sd-cpp): an undiscovered
    // or unreachable sd.cpp/ComfyUI instance is skipped with a structured
    // reason instead of a doomed generation attempt.
    const skip = await discoverySkipAttempt(candidate, apiKey,);
    if (skip) {
      attempts.push(skip,);
      continue;
    }

    last = await attemptCandidate(candidate, { ...opts, apiKey, }, attempts,);
    if (last.ok) { return last; }
  }

  if (!last) {
    // Every candidate was refused by the discovery gate — nothing was attempted.
    const summary = attempts.map((attempt,) => `${attempt.provider}: ${attempt.reason}`).join("; ",);
    return { ...failure(`No reachable image generation provider — ${summary}`, 502,), attempts, };
  }

  // Loop exit means `last` is a failure — successes returned inside the loop.
  return last.ok ? last : { ...last, attempts, };
}
