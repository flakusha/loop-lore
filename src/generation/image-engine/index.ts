// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { listSdProviders, } from "../../config/schema";
import { validateProviderUrl, } from "../../utils/url-validation";
import { generateComfyUI, } from "./comfyui";
import { failure, } from "./helpers";
import { generateOpenAI, } from "./openai";
import { generateSDAPI, } from "./sdapi";
import { generateSDCPP, } from "./sdcpp";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

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

/**
 * Generate images with cross-backend failover (ordered fallback list).
 *
 * Candidates are ordered by `purpose` fit (exact → both → rest). The first
 * backend returning a success outcome wins; each attempt gets its own BYO
 * key resolved by provider name. A caller-resolved `opts.apiKey` is honored
 * on the first candidate only — per-provider resolution takes over after a
 * failed attempt so a key for backend A never bills backend B.
 * @param providers - All configured SD providers (may be undefined)
 * @param purpose - What the provider will be used for
 * @param opts - Generation request inputs (no per-attempt key needed)
 * @param resolveApiKey - Optional BYO key resolver keyed by provider name
 * @returns A discriminated outcome; the LAST candidate's failure when every backend fails
 */
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

  let last: ImageGenOutcome | undefined;
  for (const [i, candidate,] of candidates.entries()) {
    const apiKey = i === 0
      ? opts.apiKey ?? await resolveApiKey?.(candidate.name,)
      : await resolveApiKey?.(candidate.name,);

    last = await generateImages(candidate, { ...opts, apiKey, },);
    if (last.ok) { return last; }
  }

  return last!;
}
