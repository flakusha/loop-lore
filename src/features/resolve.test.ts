// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Resolver tests: exact surface per profile, no conditional branching by
// profile string, and the FEATURE_PROFILES re-export.

import type { FeatureProfile, } from "@loop-lore/core/config/schema/features";
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { FEATURE_PROFILES, type FeatureSurface, resolveFeatures, } from "./resolve";

const EXPECTED: Record<FeatureProfile, FeatureSurface> = {
  full: {
    chat: true,
    business: true,
    generation: true,
    federation: true,
    plugins: true,
    harness: true,
    honeypotIntel: true,
    telemetry: true,
  },
  "business-only": {
    chat: false,
    business: true,
    generation: false,
    federation: false,
    plugins: true,
    harness: true,
    honeypotIntel: false,
    telemetry: true,
  },
  "rpg-chat-only": {
    chat: true,
    business: false,
    generation: true,
    federation: false,
    plugins: true,
    harness: false,
    honeypotIntel: false,
    telemetry: true,
  },
  "local-only": {
    chat: true,
    business: false,
    generation: true,
    federation: false,
    plugins: true,
    harness: false,
    honeypotIntel: false,
    telemetry: false,
  },
  "relay-only": {
    chat: false,
    business: false,
    generation: false,
    federation: true,
    plugins: false,
    harness: false,
    honeypotIntel: true,
    telemetry: true,
  },
};

describe("resolveFeatures", () => {
  for (const profile of FEATURE_PROFILES) {
    test(`${profile} resolves to its exact surface`, () => {
      expect(resolveFeatures(profile,),).toEqual(EXPECTED[profile],);
    });
  }

  test("re-exported FEATURE_PROFILES matches the core list", () => {
    expect(FEATURE_PROFILES,).toEqual(["full", "business-only", "rpg-chat-only", "local-only", "relay-only",],);
  });

  test("profile strings live only in the matrix, no conditional branching", () => {
    const source = readFileSync(join(import.meta.dir, "resolve.ts",), "utf8",);
    expect(source,).toContain("Record<FeatureProfile, FeatureSurface>",);
    expect(source,).not.toMatch(/\bswitch\s*\(/,);
    for (const profile of FEATURE_PROFILES) {
      expect(source,).not.toMatch(new RegExp(`===\\s*"${profile}"`,),);
    }
  });
});
