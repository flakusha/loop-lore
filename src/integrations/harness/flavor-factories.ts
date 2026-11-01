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
import { type HarnessAdapterFactory, } from "./adapter-types";
import { createCodexAdapter, } from "./codex";
import { createOmpAdapter, } from "./omp";
import { createOpenCodeAdapter, } from "./opencode";

/** Flavor assumed when a profile omits `harness` (back-compat with pre-flavor configs). */
export const DEFAULT_HARNESS_FLAVOR: HarnessFlavor = "omp";

/** Flavor → factory. `omp` is the reference adapter; new flavors register here. */
export const HARNESS_ADAPTER_FACTORIES: Record<HarnessFlavor, HarnessAdapterFactory> = {
  omp: createOmpAdapter,
  opencode: createOpenCodeAdapter,
  codex: createCodexAdapter,
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
