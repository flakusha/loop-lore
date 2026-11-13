// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness admin settings view shaping.
 *
 * Turns the effective settings store view into the wire body the admin panel
 * decodes (`GET`/`PUT /harness/settings`): per-profile provider-ToS
 * decoration and binary availability probing. Split out of the harness route
 * plugin so the route module stays the HTTP surface and this stays the
 * view-model layer.
 */
import {
  type HarnessAvailabilityView,
  type HarnessSettingsView,
} from "../../frontend/alpine/admin-harness-schema";
import {
  getHarnessAdminFileConfig,
  getHarnessAdminSettings,
  type HarnessProfileSettingsView,
} from "../../integrations/harness/admin-settings";
import { probeHarnessCommand, } from "../../integrations/harness/availability";
import { HARNESS_PROVIDER_TOS, providerTosInfo, } from "../../integrations/harness/provider-tos";
import { getRepoAccessSettings, } from "../../integrations/harness/repo-access";

/**
 * Decorate one configured profile with the static provider ToS matrix from
 * `provider-tos.ts` — the admin panel renders usage class + note per flavor
 * straight off the wire, so the matrix stays the single in-code source.
 * @param p - the store's profile view
 * @returns the wire shape the panel decodes (HarnessSettingsResponse item).
 */
function decorateProfile(p: HarnessProfileSettingsView,): {
  name: string;
  flavor: string;
  usageClasses: string[];
  subscriptionBacked: boolean;
  noteKey: string;
  tosGrayzoneAcknowledged: boolean;
} {
  const tos = providerTosInfo(p.flavor,);
  return {
    name: p.name,
    flavor: p.flavor,
    usageClasses: [...tos.usageClasses,],
    subscriptionBacked: tos.subscriptionBacked,
    noteKey: tos.noteKey,
    tosGrayzoneAcknowledged: p.tosGrayzoneAcknowledged,
  };
}

/**
 * The configured profile flavor the provider-ToS matrix does not know.
 *
 * The matrix is the same table `providerTosInfo` reads, so this names the
 * flavor that made the decoration throw without a second list of flavors to
 * keep in sync.
 * @returns the offending flavor, or undefined when every flavor is known.
 */
export function unknownFlavor(): string | undefined {
  const bad = getHarnessAdminSettings().profiles.find((p,) => !Object.hasOwn(HARNESS_PROVIDER_TOS, p.flavor,));

  return bad?.flavor;
}

/**
 * Probe one profile's binary availability (TASK-optional-dep-packaging).
 * The probed argv comes from the admin-owned file config only — the same
 * invariant as the isolation gate's allowlist: caller input never becomes a
 * spawn argv. Lazy and cached per process; `refresh` re-runs the probe.
 * @param name - the profile's loop-lore-local name
 * @param refresh - bypass the probe cache when true
 * @returns the wire availability verdict.
 */
async function availabilityForProfile(name: string, refresh: boolean,): Promise<HarnessAvailabilityView> {
  const profile = getHarnessAdminFileConfig().profiles.find((p,) => p.name === name);
  if (profile === undefined) {
    return { available: false, reason: "profile not present in harness.acp config", };
  }

  const verdict = await probeHarnessCommand({ command: profile.command, refresh, },);
  return verdict.available
    ? { available: true, version: verdict.version, }
    : { available: false, reason: verdict.reason, };
}

/**
 * Shape the effective settings view into the wire body, probing every
 * configured profile's binary availability sequentially (the profile list is
 * tiny, and verdicts are cached after the first hit).
 * @param refresh - bypass the probe cache when true
 * @returns the `GET`/`PUT /harness/settings` response body.
 */
export async function settingsWithAvailability(refresh: boolean,): Promise<HarnessSettingsView> {
  const view = getHarnessAdminSettings();

  const profiles: HarnessSettingsView["profiles"] = [];

  for (const p of view.profiles) {
    profiles.push({ ...decorateProfile(p,), availability: await availabilityForProfile(p.name, refresh,), },);
  }

  return {
    enabled: view.enabled,
    profiles,
    // RSI repo-access tier switch — a separate store from the ACP master
    // switch (repo-access/settings.ts), same override-wins layering.
    repoAccessEnabled: getRepoAccessSettings().enabled,
  };
}
