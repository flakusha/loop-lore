// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Provider ToS matrix tests: the per-flavor mapping must stay complete over
 * HARNESS_FLAVORS, class-valid, and subscription-flag-consistent. Pure —
 * parallel-safe.
 */
import { describe, expect, it, } from "bun:test";
import { HARNESS_FLAVORS, } from "../../config/schema/harness";
import { DEFAULT_HARNESS_FLAVOR, } from "./flavor-factories";
import {
  HARNESS_PROVIDER_TOS,
  HARNESS_USAGE_CLASSES,
  providerTosInfo,
} from "./provider-tos";

describe("HARNESS_PROVIDER_TOS matrix", () => {
  it("covers every HARNESS_FLAVORS entry", () => {
    for (const flavor of HARNESS_FLAVORS) {
      expect(HARNESS_PROVIDER_TOS[flavor],).toBeDefined();
    }
  });

  it("carries a non-empty, class-valid usage-class list per flavor", () => {
    for (const flavor of HARNESS_FLAVORS) {
      const info = HARNESS_PROVIDER_TOS[flavor];
      expect(info.usageClasses.length,).toBeGreaterThan(0,);
      for (const usageClass of info.usageClasses) {
        expect(HARNESS_USAGE_CLASSES,).toContain(usageClass,);
      }
    }
  });

  it("keeps subscriptionBacked consistent with the usage-class list", () => {
    for (const flavor of HARNESS_FLAVORS) {
      const info = HARNESS_PROVIDER_TOS[flavor];
      expect(info.subscriptionBacked,).toBe(info.usageClasses.includes("subscription-backed",),);
    }
  });

  it("routes every note through the localized harness.tos.note namespace", () => {
    for (const flavor of HARNESS_FLAVORS) {
      expect(HARNESS_PROVIDER_TOS[flavor].noteKey,).toMatch(/^harness\.tos\.note\./,);
    }
  });

  it("gates only the subscription-login flavors, never local/API runners", () => {
    expect(HARNESS_PROVIDER_TOS.omp.subscriptionBacked,).toBe(false,);
    expect(HARNESS_PROVIDER_TOS.opencode.subscriptionBacked,).toBe(false,);
    expect(HARNESS_PROVIDER_TOS.codex.subscriptionBacked,).toBe(true,);
    expect(HARNESS_PROVIDER_TOS["claude-code"].subscriptionBacked,).toBe(true,);
  });

  it("marks local and api classes — the ungated ones — in the union", () => {
    expect(HARNESS_USAGE_CLASSES,).toContain("local",);
    expect(HARNESS_USAGE_CLASSES,).toContain("api",);
  });
});

describe("providerTosInfo", () => {
  it("defaults an omitted flavor to the shipped default flavor", () => {
    expect(providerTosInfo(),).toBe(HARNESS_PROVIDER_TOS[DEFAULT_HARNESS_FLAVOR],);
    expect(DEFAULT_HARNESS_FLAVOR,).toBe("omp",);
  });

  it("resolves every flavor and trims through the same table", () => {
    for (const flavor of HARNESS_FLAVORS) {
      expect(providerTosInfo(flavor,),).toBe(HARNESS_PROVIDER_TOS[flavor],);
    }
  });

  it("throws on a flavor with no metadata", () => {
    expect(() => providerTosInfo("bedrock",)).toThrow(/no provider ToS metadata/,);
  });
});
