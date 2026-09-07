// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Search fallback orchestrator — quarantine-aware provider chain.
 *
 * Contract for deep research: try providers in priority order, skip
 * quarantined ones, fail a captcha'd provider over to the next without
 * retry, and throw an aggregate error only when every provider is out.
 * Callers degrade the research run (fewer sources, cited as partial)
 * instead of aborting.
 */

import { CaptchaBlockedError, ProviderRateLimitedError, SearchProviderError, } from "./errors";
import { maySearch, quarantineOnCaptcha, quarantineOnRateLimit, searchBreaker, } from "./quarantine";

/** Normalized web-search hit. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  provider: string;
}

/** Minimal provider surface the orchestrator drives. */
export interface SearchProvider {
  name: string;
  search(query: string, maxResults: number,): Promise<SearchResult[]>;
}

/** Options for a fallback search run. */
export interface FallbackSearchOptions {
  maxResults?: number;
  quarantineMs?: number;
}

/**
 * Search across providers in order, skipping quarantined ones.
 * @param providers - Priority-ordered providers (self-hosted/API first, scrape last)
 * @param query - User query
 * @param opts - Result budget + captcha quarantine duration
 * @returns First successful provider's results
 * @throws Error aggregating per-provider reasons when all fail
 */
export async function searchWithFallback(
  providers: SearchProvider[],
  query: string,
  opts: FallbackSearchOptions = {},
): Promise<SearchResult[]> {
  const { maxResults = 10, quarantineMs, } = opts;
  const failures: string[] = [];

  for (const provider of providers) {
    if (!maySearch(provider.name,)) {
      const state = searchBreaker.getState(provider.name,);
      failures.push(`${provider.name}: quarantined (${Math.ceil((state?.cooldownRemainingMs ?? 0) / 1000,)}s left)`,);
      continue;
    }
    try {
      const results = await provider.search(query, maxResults,);
      searchBreaker.onSuccess(provider.name,);
      return results;
    } catch (error) {
      if (error instanceof CaptchaBlockedError) {
        quarantineOnCaptcha(error.provider, quarantineMs ?? error.quarantineMs,);
      } else if (error instanceof ProviderRateLimitedError) {
        quarantineOnRateLimit(error.provider, error.retryAfterMs,);
      } else if (error instanceof SearchProviderError) {
        quarantineOnRateLimit(provider.name, 30_000,);
      } else {
        searchBreaker.onFailure(provider.name,);
      }
      failures.push(`${provider.name}: ${(error as Error).message}`,);
    }
  }

  throw new Error(`All search providers failed: ${failures.join("; ",)}`,);
}
