// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/sd-provider.ts — SD provider selection helpers

import type { ImageProviderConfig, } from "./providers";

/**
 * Order SD providers for a given purpose (fallback order).
 *
 * Ordering:
 * 1. Providers matching `purpose` exactly
 * 2. Providers serving both purposes (or with no purpose set)
 * 3. Remaining providers, config order preserved
 *
 * Deduplicated, so a provider never appears twice.
 * @param providers - Array of SD provider configs (may be undefined)
 * @param purpose - What the provider will be used for
 * @returns Ordered candidate list; empty when none configured
 */
export function listSdProviders(
  providers: ImageProviderConfig[] | undefined,
  purpose: "generate" | "edit",
): ImageProviderConfig[] {
  if (!providers || providers.length === 0) { return []; }

  const ordered: ImageProviderConfig[] = [];
  const seen = new Set<ImageProviderConfig>();
  const push = (p: ImageProviderConfig | undefined,): void => {
    if (p && !seen.has(p,)) {
      seen.add(p,);
      ordered.push(p,);
    }
  };

  for (const p of providers) { push(p.purpose === purpose ? p : undefined,); }
  for (const p of providers) { push(p.purpose === "both" || !p.purpose ? p : undefined,); }
  for (const p of providers) { push(p,); }

  return ordered;
}

/**
 * Pick the best SD provider for a given purpose.
 *
 * Equivalent to the first entry of {@link listSdProviders} — the ordered
 * list is the failover-capable form (BUG-image-audio-providers-no-byo-key-
 * or-failover); use it when a caller can retry the next candidate.
 * @param providers - Array of SD provider configs (may be undefined)
 * @param purpose - What the provider will be used for
 * @returns Best matching provider, or undefined if none configured
 */
export function pickSdProvider(
  providers: ImageProviderConfig[] | undefined,
  purpose: "generate" | "edit",
): ImageProviderConfig | undefined {
  return listSdProviders(providers, purpose,)[0];
}
