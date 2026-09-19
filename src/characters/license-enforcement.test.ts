// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the license enforcement helpers (TASK-030).
 */
import { describe, expect, test, } from "bun:test";
import type { LicenseInfo, } from "./license-enforcement";
import { licenseHeaders, licenseWarnings, withLicenseExtension, } from "./license-enforcement";

/** Build a licensing row with overridable fields. */
function licensingRow(overrides: Partial<LicenseInfo> = {},): LicenseInfo {
  return {
    license_type: "cc_by",
    custom_license_text: null,
    attribution: null,
    allow_derivatives: 1,
    allow_commercial: 1,
    share_alike: 0,
    ...overrides,
  };
}

describe("licenseWarnings", () => {
  test("warns when an attribution-required license has no attribution", () => {
    const warnings = licenseWarnings(licensingRow({ license_type: "cc_by", attribution: null, },),);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0],).toContain("attribution",);
    expect(licenseWarnings(licensingRow({ license_type: "cc_by_nc_sa", attribution: null, },),),).toHaveLength(1,);
  });

  test("no warning when attribution is set or license does not require it", () => {
    expect(licenseWarnings(licensingRow({ attribution: "Aria", },),),).toHaveLength(0,);
    expect(licenseWarnings(licensingRow({ license_type: "cc0", attribution: null, },),),).toHaveLength(0,);
    expect(licenseWarnings(licensingRow({ license_type: "proprietary", attribution: null, },),),).toHaveLength(0,);
  });
});

describe("licenseHeaders", () => {
  test("emits type header always and warning header only on warnings", () => {
    expect(licenseHeaders(null,),).toEqual({},);
    const clean = licenseHeaders(licensingRow({ attribution: "Aria", },),);
    expect(clean["X-License-Type"],).toBe("cc_by",);
    expect(clean["X-License-Warning"],).toBeUndefined();
    const warned = licenseHeaders(licensingRow({},),);
    expect(warned["X-License-Warning"],).toContain("attribution",);
  });
});

describe("withLicenseExtension", () => {
  test("embeds license under data.extensions and preserves existing extensions", () => {
    const card = JSON.stringify({
      spec: "chara_card_v3",
      data: { name: "Aldric", extensions: { depth_prompt: { post: "x", }, }, },
    },);
    const out = JSON.parse(withLicenseExtension(card, licensingRow({ attribution: "Aria", },),),) as {
      data: { name: string; extensions: { depth_prompt: unknown; license: { license_type: string } } };
    };
    expect(out.data.name,).toBe("Aldric",);
    expect(out.data.extensions.license.license_type,).toBe("cc_by",);
    expect(out.data.extensions.depth_prompt,).toEqual({ post: "x", },);
  });

  test("returns payload unchanged for null licensing or malformed JSON", () => {
    const card = JSON.stringify({ spec: "chara_card_v3", data: { name: "Aldric", }, },);
    expect(withLicenseExtension(card, null,),).toBe(card,);
    expect(withLicenseExtension("not-json{{{", licensingRow({},),),).toBe("not-json{{{",);
  });
});
