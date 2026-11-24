// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Resource contract: pure functions over a cloned default config — no DB,
// no files, no ports, no shared state.
import { describe, expect, test, } from "bun:test";
import { FEATURE_PROFILES, } from "../schema/features";
import { FEATURES_DEFAULTS, } from "../sections/features";
import { createConfigSchema, } from "./index";
import { validate, } from "./validate";

/** A fresh mutable clone of the resolved defaults. */
const defaults = () => structuredClone(createConfigSchema().defaults,);

describe("features profile", () => {
  test("defaults to full", () => {
    expect(FEATURES_DEFAULTS.profile,).toBe("full",);
    expect(defaults().features?.profile,).toBe("full",);
  });

  test("accepts every declared profile", () => {
    for (const profile of FEATURE_PROFILES) {
      const config = defaults();
      config.features = { profile, };
      expect(() => validate(config,)).not.toThrow();
    }
  });

  test("rejects an unknown explicit profile, listing allowed values", () => {
    const config = defaults();
    config.features = { profile: "bogus" as never, };
    expect(() => validate(config,)).toThrow(/full, business-only, rpg-chat-only, local-only, relay-only/,);
  });

  test("accepts missing features and missing profile", () => {
    const withoutFeatures = defaults();
    delete withoutFeatures.features;
    expect(() => validate(withoutFeatures,)).not.toThrow();

    const withoutProfile = defaults();
    withoutProfile.features = {} as NonNullable<typeof withoutProfile.features>;
    expect(() => validate(withoutProfile,)).not.toThrow();
  });
});
