// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../../../config/schema";

// ── URL Resolution ───────────────────────────────────────

/**
 * Resolve backend base URLs from config by apiFamily.
 *
 * A single `sd[]` provider array can hold multiple image backends (ComfyUI,
 * sd.cpp/SD WebUI). `pickSdProvider()` selects a single provider by purpose,
 * so it cannot resolve per-backend URLs. Here each backend is looked up by its
 * `apiFamily` field and falls back to a sensible localhost default.
 *
 * @param config - App config (may be undefined)
 * @returns Resolved backend URLs
 *
 * @example
 * ```ts
 * const { comfyUrl, sdServerUrl } = resolveBackendUrls(config);
 * ```
 */
export function resolveBackendUrls(config?: Config,): { comfyUrl: string; sdServerUrl: string } {
  const sdProviders = config?.generation?.providers?.sd ?? [];
  const comfyProvider = sdProviders.find((p,) => p.apiFamily === "comfyui");
  const sdServerProvider = sdProviders.find((p,) => p.apiFamily === "sdcpp");
  return {
    comfyUrl: comfyProvider?.baseUrl ?? "http://localhost:8188",
    sdServerUrl: sdServerProvider?.baseUrl ?? "http://localhost:9010",
  };
}
