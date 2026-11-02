// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * provider-tos.ts — static per-flavor provider ToS metadata
 * (TASK-harness-provider-tos-usage-class-matrix).
 *
 * Maps each `HARNESS_FLAVORS` entry to a usage-class union plus a provider
 * ToS note, distinguishing subscription-backed profiles (a provider
 * subscription account driven for RPG/other non-chat functionality — the ToS
 * grayzone) from local and api profiles (local model runners and direct BYOK
 * API access — NOT limited by ToS by default and must stay ungated).
 *
 * Metadata only: the matrix informs the admin UI and future dispatch-guard
 * refinements but gates nothing by itself. Static, in code — never config,
 * never DB. The note TEXT lives in the locale files under the returned
 * `noteKey`, because the admin panel renders every string through i18n (the
 * locale-parity test enforces the harness.* namespace); the key, the usage
 * classes and the subscription flag are the in-code source of truth.
 */

import { type HarnessFlavor, } from "../../config/schema/harness";

/** How a harness profile is billed/governed, as a closed runtime union. */
export const HARNESS_USAGE_CLASSES = ["subscription-backed", "local", "api",] as const;

/** One usage class: `subscription-backed`, `local`, or `api`. */
export type HarnessUsageClass = (typeof HARNESS_USAGE_CLASSES)[number];

/** Provider ToS metadata for one harness flavor. */
export interface HarnessProviderTosInfo {
  /** Usage classes this flavor's profiles can run under. Never empty. */
  usageClasses: readonly HarnessUsageClass[];
  /**
   * True when the flavor can drive a provider SUBSCRIPTION (the ToS
   * grayzone): enabling such a profile requires explicit acknowledgement.
   */
  subscriptionBacked: boolean;
  /** Locale key (`harness.tos.note.*`) of the provider ToS note text. */
  noteKey: string;
}

/**
 * Flavor assumed when a profile omits `harness`. Mirrors
 * `DEFAULT_HARNESS_FLAVOR` from flavor-factories (not imported: this module
 * must stay a leaf that wire decoration can use without dragging the adapter
 * graph in); the provider-tos test cross-checks the two constants.
 */
const DEFAULT_FLAVOR: HarnessFlavor = "omp";

/**
 * Flavor → provider ToS metadata. Exhaustive over `HarnessFlavor`: adding a
 * flavor without metadata here is a compile error, and the unit test asserts
 * the runtime list cannot drift either.
 */
export const HARNESS_PROVIDER_TOS: Record<HarnessFlavor, HarnessProviderTosInfo> = {
  omp: {
    usageClasses: ["api", "local",],
    subscriptionBacked: false,
    noteKey: "harness.tos.note.omp",
  },
  opencode: {
    usageClasses: ["api", "local",],
    subscriptionBacked: false,
    noteKey: "harness.tos.note.opencode",
  },
  codex: {
    usageClasses: ["subscription-backed", "api",],
    subscriptionBacked: true,
    noteKey: "harness.tos.note.codex",
  },
  "claude-code": {
    usageClasses: ["subscription-backed", "api",],
    subscriptionBacked: true,
    noteKey: "harness.tos.note.claude-code",
  },
};

/**
 * Resolve the ToS metadata for a profile's `harness` flavor.
 * @param flavor - the profile's `harness` value, when set
 * @returns the static metadata for the (defaulted) flavor.
 * @throws {Error} When no metadata ships for the flavor (config validation
 * rejects unknown flavors at load; this guards direct callers).
 */
export function providerTosInfo(flavor?: string,): HarnessProviderTosInfo {
  const key = (flavor ?? DEFAULT_FLAVOR) as HarnessFlavor;
  const info = HARNESS_PROVIDER_TOS[key];
  if (!info) {
    throw new Error(`no provider ToS metadata for harness flavor "${flavor}"`,);
  }

  return info;
}
