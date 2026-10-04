// src/characters/shared/character-systems-utils.test.ts
//
// Edge-case tests for the character-systems export/import field mapping.
// Trust boundary: missing keys, unknown keys, round-trip fidelity,
// and errMsg coercion of non-Error values.

import { describe, expect, it, } from "bun:test";

import {
  AVAILABILITY_FIELDS,
  AVATAR_FIELDS,
  errMsg,
  LICENSING_FIELDS,
  mapAvatarForExport,
  mapRelationshipForExport,
  mapTraitForExport,
  RELATIONSHIP_FIELDS,
  toDbFields,
  toExportFields,
  TRAIT_DB_COLUMNS,
  TRAIT_EXPORT_FIELDS,
} from "./character-systems-utils";

describe("toExportFields", () => {
  it("maps DB columns to export fields", () => {
    const row = {
      license_type: "cc0",
      custom_license_text: "Public domain",
      attribution: "Loop Lore",
      allow_derivatives: true,
      allow_commercial: false,
      share_alike: true,
    };

    const result = toExportFields(row, LICENSING_FIELDS,);
    expect(result,).toEqual({
      licenseType: "cc0",
      customLicenseText: "Public domain",
      attribution: "Loop Lore",
      allowDerivatives: true,
      allowCommercial: false,
      shareAlike: true,
    },);
  });

  it("produces undefined values for missing DB columns", () => {
    const result = toExportFields({}, LICENSING_FIELDS,);
    expect(Object.keys(result,),).toHaveLength(6,);
    expect("licenseType" in result,).toBe(true,);
    expect(result.licenseType,).toBeUndefined();
    expect(result.shareAlike,).toBeUndefined();
  });

  it("ignores extra row keys", () => {
    const row = { license_type: "mit", unrelated: "x", another: 1, };
    const result = toExportFields(row, LICENSING_FIELDS,);
    expect("unrelated" in result,).toBe(false,);
    expect("another" in result,).toBe(false,);
    expect(result.licenseType,).toBe("mit",);
  });

  it("returns an empty object for an empty field map", () => {
    expect(toExportFields({ a: 1, }, [],),).toEqual({},);
  });

  it("maps availability fields", () => {
    const row = {
      status: "active",
      usage_policy: "free",
      activity_restrictions: "none",
      content_policy: "sfw_only",
      nsfw_policy: "disallow",
    };

    const result = toExportFields(row, AVAILABILITY_FIELDS,);
    expect(result,).toEqual({
      status: "active",
      usagePolicy: "free",
      activityRestrictions: "none",
      contentPolicy: "sfw_only",
      nsfwPolicy: "disallow",
    },);
  });
});

describe("toDbFields", () => {
  it("maps export fields back to DB columns", () => {
    const data = {
      licenseType: "cc0",
      customLicenseText: "Public domain",
      attribution: "Loop Lore",
      allowDerivatives: true,
      allowCommercial: false,
      shareAlike: true,
    };

    const result = toDbFields(data, LICENSING_FIELDS,);
    expect(result,).toEqual({
      license_type: "cc0",
      custom_license_text: "Public domain",
      attribution: "Loop Lore",
      allow_derivatives: true,
      allow_commercial: false,
      share_alike: true,
    },);
  });

  it("skips absent export fields", () => {
    const result = toDbFields({ licenseType: "mit", }, LICENSING_FIELDS,);
    expect(result,).toEqual({ license_type: "mit", },);
    expect("share_alike" in result,).toBe(false,);
  });

  it("ignores unknown export fields", () => {
    const result = toDbFields({ licenseType: "mit", bogusField: 1, }, LICENSING_FIELDS,);
    expect("bogusField" in result,).toBe(false,);
    expect("bogus_field" in result,).toBe(false,);
  });

  it("round-trips a row through export then import", () => {
    const row = {
      status: "active",
      usage_policy: "free",
      activity_restrictions: "none",
      content_policy: "sfw_only",
      nsfw_policy: "disallow",
    };

    const exported = toExportFields(row, AVAILABILITY_FIELDS,);
    expect(toDbFields(exported, AVAILABILITY_FIELDS,),).toEqual(row,);
  });

  it("returns an empty object for an empty field map", () => {
    expect(toDbFields({ a: 1, }, [],),).toEqual({},);
  });

  it("round-trips licensing fields", () => {
    const row = {
      license_type: "cc-by",
      custom_license_text: "Credit me",
      attribution: "Author",
      allow_derivatives: true,
      allow_commercial: true,
      share_alike: false,
    };

    const exported = toExportFields(row, LICENSING_FIELDS,);
    expect(toDbFields(exported, LICENSING_FIELDS,),).toEqual(row,);
  });
});

describe("mapTraitForExport", () => {
  it("maps trait DB fields to export fields", () => {
    const result = mapTraitForExport({
      trait_category: "personality",
      trait_name: "brave",
      trait_value: "high",
    },);

    expect(result,).toEqual({ category: "personality", name: "brave", value: "high", },);
  });

  it("maps empty strings without alteration", () => {
    const result = mapTraitForExport({ trait_category: "", trait_name: "", trait_value: "", },);
    expect(result,).toEqual({ category: "", name: "", value: "", },);
  });
});

describe("mapRelationshipForExport", () => {
  it("maps all relationship fields", () => {
    const metadata = { note: "met at a tavern", };
    const result = mapRelationshipForExport({
      targetActorId: "actor-42",
      relationshipType: "ally",
      standing: 75,
      trust: 60,
      familiarity: 30,
      isBidirectional: true,
      metadata,
    },);

    expect(result,).toEqual({
      targetActorId: "actor-42",
      relationshipType: "ally",
      standing: 75,
      trust: 60,
      familiarity: 30,
      isBidirectional: true,
      metadata,
    },);

    expect(result.metadata,).toBe(metadata,);
  });

  it("preserves zero and false values", () => {
    const result = mapRelationshipForExport({
      targetActorId: "",
      relationshipType: "rival",
      standing: 0,
      trust: 0,
      familiarity: 0,
      isBidirectional: false,
      metadata: {},
    },);

    expect(result.standing,).toBe(0,);
    expect(result.isBidirectional,).toBe(false,);
    expect(result.metadata,).toEqual({},);
  });
});

describe("mapAvatarForExport", () => {
  it("maps all avatar fields", () => {
    const tags = { kind: "portrait", };
    const result = mapAvatarForExport({
      assetId: "asset-7",
      label: "Main portrait",
      tags,
      isPrimary: true,
      sortOrder: 1,
    },);

    expect(result,).toEqual({
      assetId: "asset-7",
      label: "Main portrait",
      tags,
      isPrimary: true,
      sortOrder: 1,
    },);

    expect(result.tags,).toBe(tags,);
  });

  it("preserves zero sortOrder and false isPrimary", () => {
    const result = mapAvatarForExport({
      assetId: "a",
      label: "l",
      tags: {},
      isPrimary: false,
      sortOrder: 0,
    },);

    expect(result.sortOrder,).toBe(0,);
    expect(result.isPrimary,).toBe(false,);
  });
});

describe("errMsg", () => {
  it("returns the message of an Error", () => {
    expect(errMsg(new Error("boom",),),).toBe("boom",);
  });

  it("returns the message of a subclassed Error", () => {
    class CustomError extends Error {}
    expect(errMsg(new CustomError("custom",),),).toBe("custom",);
  });

  it("stringifies strings", () => {
    expect(errMsg("plain failure",),).toBe("plain failure",);
  });

  it("stringifies numbers", () => {
    expect(errMsg(42,),).toBe("42",);
    expect(errMsg(0,),).toBe("0",);
  });

  it("stringifies null and undefined", () => {
    expect(errMsg(null,),).toBe("null",);
    expect(errMsg(undefined,),).toBe("undefined",);
  });

  it("stringifies objects", () => {
    expect(errMsg({ code: 1, },),).toBe("[object Object]",);
  });

  it("stringifies arrays", () => {
    expect(errMsg([1, 2,],),).toBe("1,2",);
  });
});

describe("field-map constants", () => {
  it("keeps trait DB columns and export fields positionally aligned", () => {
    expect(TRAIT_DB_COLUMNS,).toHaveLength(TRAIT_EXPORT_FIELDS.length,);
    expect(TRAIT_DB_COLUMNS,).toEqual(["trait_category", "trait_name", "trait_value",],);
    expect(TRAIT_EXPORT_FIELDS,).toEqual(["category", "name", "value",],);
  });

  it("defines six licensing pairs", () => {
    expect(LICENSING_FIELDS,).toHaveLength(6,);
    for (const pair of LICENSING_FIELDS) {
      expect(pair,).toHaveLength(2,);
      expect(typeof pair[0],).toBe("string",);
      expect(typeof pair[1],).toBe("string",);
    }
  });

  it("defines five availability pairs", () => {
    expect(AVAILABILITY_FIELDS,).toHaveLength(5,);
  });

  it("defines seven relationship export fields", () => {
    expect(RELATIONSHIP_FIELDS,).toHaveLength(7,);
  });

  it("defines five avatar export fields", () => {
    expect(AVATAR_FIELDS,).toHaveLength(5,);
  });
});
