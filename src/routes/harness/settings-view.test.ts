// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the harness settings view-model: settingsWithAvailability
 * (store view -> wire body with per-profile availability probes) and
 * unknownFlavor (names the profile flavor the provider-ToS matrix rejects).
 *
 * Resource contract (parallel-safe): the admin settings store is the only
 * global touched (reset in afterEach); the availability probe is stubbed via
 * mock.module with the mirror-image restore (mock.module is process-global —
 * see index.test.ts); no ports, no fixed paths, no process spawn.
 */
import { afterEach, describe, expect, it, mock, } from "bun:test";
import type { HarnessAcpConfig, } from "../../config/schema/harness";
import {
  initHarnessAdminSettings,
  resetHarnessAdminSettings,
} from "../../integrations/harness/admin-settings";
import * as realAvailability from "../../integrations/harness/availability";
import { settingsWithAvailability, unknownFlavor, } from "./settings-view";

const REAL_AVAILABILITY: Record<string, unknown> = { ...realAvailability, };

afterEach(() => {
  resetHarnessAdminSettings();
  mock.module("../../integrations/harness/availability", () => REAL_AVAILABILITY,);
},);

/** A disabled config whose flavor the provider-ToS matrix does not know. */
const TYPO_FLAVOR_CONFIG = {
  enabled: false,
  profiles: [{ name: "broken", command: ["fake", "acp",], harness: "bedrock", tiers: {}, },],
} as unknown as HarnessAcpConfig;

describe("settingsWithAvailability", () => {
  it("shapes the store view into the wire body with probed availability", async () => {
    mock.module("../../integrations/harness/availability", () => ({
      ...REAL_AVAILABILITY,
      probeHarnessCommand: () => Promise.resolve({ available: true, version: "1.2.3", },),
    }),);

    initHarnessAdminSettings({
      enabled: true,
      profiles: [
        { name: "omp-main", command: ["omp", "acp",], tiers: {}, },
        { name: "second", command: ["other", "acp",], tiers: {}, },
      ],
    },);

    const view = await settingsWithAvailability(false,);
    expect(view.enabled,).toBe(true,);
    expect(view.profiles,).toHaveLength(2,);
    expect(view.profiles[0],).toMatchObject({
      name: "omp-main",
      availability: { available: true, version: "1.2.3", },
    },);

    expect(view.profiles[0]?.transport,).toBe("acp",);

    // The RSI repo-access tier switch is a separate store, default off.
    expect(view.repoAccessEnabled,).toBe(false,);
  });
});

describe("unknownFlavor", () => {
  it("names the profile flavor the provider-ToS matrix does not know", () => {
    initHarnessAdminSettings(TYPO_FLAVOR_CONFIG,);
    expect(unknownFlavor(),).toBe("bedrock",);
  });

  it("is undefined when every configured flavor is known", () => {
    initHarnessAdminSettings({
      enabled: false,
      profiles: [{ name: "ok", command: ["fake", "acp",], harness: "omp", tiers: {}, },],
    },);

    expect(unknownFlavor(),).toBeUndefined();
  });
});
