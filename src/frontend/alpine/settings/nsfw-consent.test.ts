// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * nsfw-consent settings mixin tests — member surface + composition.
 *
 * The mixin holds the NSFW consent members split out of general.ts (size
 * gate); behavioral coverage (load/persist paths) lives in general.test.ts
 * via the composed host.
 */
import { describe, expect, test, } from "bun:test";
import { general, } from "./general";
import { nsfwConsentSettings, } from "./nsfw-consent";

describe("nsfwConsentSettings", () => {
  test("exposes the NSFW consent members", () => {
    const mixin = nsfwConsentSettings();

    expect(typeof mixin.loadNsfwConsent,).toBe("function",);
    expect(typeof mixin.nsfwRestrictionText,).toBe("function",);
    expect(typeof mixin.onNsfwBlurChange,).toBe("function",);
  });

  test("is composed into the general settings mixin", () => {
    const composed = general();

    expect(typeof composed.loadNsfwConsent,).toBe("function",);
    expect(typeof composed.nsfwRestrictionText,).toBe("function",);
    expect(typeof composed.onNsfwBlurChange,).toBe("function",);
  });
});
