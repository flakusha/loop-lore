// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * flavor-factories.ts — the flavor → adapter-factory map.
 *
 * Turns a `harness.acp.profiles[]` entry's `harness` flavor into the
 * {@link HarnessAdapterFactory} that ProfileRegistry consumes. There is no
 * composition root on dev yet (ProfileRegistry is only constructed in
 * tests), so this module is deliberately the ONE place a wiring slice has to
 * touch: resolve a profile via {@link resolveAdapterFactory} and inject the
 * result. New flavors register here — nothing else is flavor-aware.
 */

import { type HarnessFlavor, } from "../../config/schema/harness";
import { type HarnessAdapterFactory, type HarnessQuotaSurface, } from "./adapter-types";
import { createAntigravityAdapter, } from "./antigravity";
import { createClaudeCodeAdapter, } from "./claude-code";
import { createCodexAdapter, } from "./codex";
import { createHermesAdapter, } from "./hermes";
import { createOmpAdapter, } from "./omp";
import { createOpenClawAdapter, } from "./openclaw";
import { createOpenCodeAdapter, } from "./opencode";

/** Flavor assumed when a profile omits `harness` (back-compat with pre-flavor configs). */
export const DEFAULT_HARNESS_FLAVOR: HarnessFlavor = "omp";

/** Flavor → factory. `omp` is the reference adapter; new flavors register here. */
export const HARNESS_ADAPTER_FACTORIES: Record<HarnessFlavor, HarnessAdapterFactory> = {
  omp: createOmpAdapter,
  opencode: createOpenCodeAdapter,
  codex: createCodexAdapter,
  "claude-code": createClaudeCodeAdapter,
  hermes: createHermesAdapter,
  openclaw: createOpenClawAdapter,
  antigravity: createAntigravityAdapter,
};

/**
 * Flavor → provider-quota wire surface, mirroring each adapter's own
 * `quotaSurface` declaration. Statically knowable per flavor (omp's
 * `_omp/usage` ext is an omp wire fact), so the usage view can render a
 * surface for a configured-but-never-probed profile; a live connection's
 * own declaration always wins over this fallback.
 */
export const FLAVOR_QUOTA_SURFACES: Record<HarnessFlavor, HarnessQuotaSurface> = {
  omp: "omp-ext",
  opencode: "none",
  codex: "none",
  "claude-code": "none",
  hermes: "none",
  openclaw: "none",
  antigravity: "none",
};
/**
 * Resolve the adapter factory for a profile's `harness` flavor.
 * @param flavor - the profile's `harness` value, when set
 * @returns the factory to inject into ProfileRegistry.
 * @throws {Error} when no adapter ships for the flavor (config validation rejects unknown flavors at load; this guards direct callers).
 */
export function resolveAdapterFactory(flavor?: string,): HarnessAdapterFactory {
  const key = (flavor ?? DEFAULT_HARNESS_FLAVOR) as HarnessFlavor;
  const factory = HARNESS_ADAPTER_FACTORIES[key];
  if (!factory) {
    throw new Error(`no ACP adapter factory for harness flavor "${flavor}"`,);
  }

  return factory;
}
