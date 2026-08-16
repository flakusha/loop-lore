// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/sd-provider.ts — SD provider selection helper

import type { ImageProviderConfig, } from "./providers";

/**
 * Pick the best SD provider for a given purpose.
 *
 * Selection logic:
 * 1. Find providers matching `purpose` (or "both")
 * 2. Among matches, prefer exact purpose match over "both"
 * 3. Fall back to first provider in array
 *
 * @param providers - Array of SD provider configs (may be undefined)
 * @param purpose - What the provider will be used for
 * @returns Best matching provider, or undefined if none configured
 */
export function pickSdProvider(
  providers: ImageProviderConfig[] | undefined,
  purpose: "generate" | "edit",
): ImageProviderConfig | undefined {
  if (!providers || providers.length === 0) { return undefined; }

  // Prefer exact purpose match
  const exact = providers.find((p,) => p.purpose === purpose);
  if (exact) { return exact; }

  // Fall back to "both"
  const both = providers.find((p,) => p.purpose === "both" || !p.purpose);
  if (both) { return both; }

  // Last resort: first provider
  return providers[0];
}
