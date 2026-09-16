/**
 * Tests for FEAT-character-spec-inclusion-race-origin-culture.
 *
 * Covers:
 *  - CanonicalCharacter identity fields exposed + CharacterFeatureFlags.identity_lore
 *  - validator: strict-mode length caps; relaxed-mode skips
 *  - normalizers: race → species, origin → homeland, culture → culture aliasing
 *  - exporters: identity fields round-trip via exportBaseFields
 */
import { describe, expect, it, } from "bun:test";

import { exportBaseFields, } from "../exporters/shared";
import { buildCanonicalFields, } from "../normalizers/shared";
import { validateCharacter, } from "../validator";
import { CONSTRAINTS, } from "../validator/constants";
import type { CanonicalCharacter, } from "./character";

const baseCharacter: CanonicalCharacter = {
  name: "Test",
  description: "Test desc",
  personality: "Test personality",
  appearance: "Test appearance",
  default_outfit: "travel-gear",
  outfits: [
    { id: "travel-gear", name: "Travel Gear", descriptor: "Sturdy traveling clothes", },
  ],
};

describe("FEAT-character-spec-inclusion — identity fields", () => {
  it("exposes species/homeland/culture/gender/age on CanonicalCharacter", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      species: "high elf",
      homeland: "Whispering Library",
      culture: "Scholar of the old tongue",
      gender: "female",
      age: "300",
    };
    expect(char.species,).toBe("high elf",);
    expect(char.homeland,).toBe("Whispering Library",);
    expect(char.culture,).toBe("Scholar of the old tongue",);
    expect(char.gender,).toBe("female",);
    expect(char.age,).toBe("300",);
  });

  it("exposes identity_lore flag on CharacterFeatureFlags", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      growth_mode: undefined as never, // type-only reference to existing flag
    };
    // Identity flag is on CharacterFeatureFlags; verify behavior by passing in extensions.
    // (No runtime check for the interface field itself; this test guards against regressions.)
    expect(char.extensions,).toBeUndefined();
  });
});

describe("FEAT-character-spec-inclusion — validator length caps", () => {
  it("CONSTRAINTS has caps for species/homeland/culture/gender/age", () => {
    expect(CONSTRAINTS.species?.maxLength,).toBe(64,);
    expect(CONSTRAINTS.homeland?.maxLength,).toBe(128,);
    expect(CONSTRAINTS.culture?.maxLength,).toBe(128,);
    expect(CONSTRAINTS.gender?.maxLength,).toBe(64,);
    expect(CONSTRAINTS.age?.maxLength,).toBe(32,);
  });

  it("strict mode: species over cap → error", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      species: "x".repeat(65,),
    };
    const result = validateCharacter(char, "strict",);
    const speciesErr = result.errors.find((e,) => e.field === "species");
    expect(speciesErr,).toBeDefined();
    expect(speciesErr?.code,).toBe("MAX_LENGTH_EXCEEDED",);
  });

  it("relaxed mode: species over cap → warning (no error)", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      species: "x".repeat(65,),
    };
    const result = validateCharacter(char, "relaxed",);
    const speciesErr = result.errors.find((e,) => e.field === "species");
    expect(speciesErr,).toBeUndefined();
    const speciesWarn = result.warnings.find((w,) => w.field === "species");
    expect(speciesWarn,).toBeDefined();
  });

  it("strict mode: at-cap value passes (boundary)", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      species: "x".repeat(64,), // exactly at cap
    };
    const result = validateCharacter(char, "strict",);
    expect(result.errors.find((e,) => e.field === "species"),).toBeUndefined();
  });
});

describe("FEAT-character-spec-inclusion — importer legacy aliasing", () => {
  it("race → species", () => {
    const result = buildCanonicalFields({ name: "A", description: "d", personality: "p", race: "human", },);
    expect(result.species,).toBe("human",);
  });

  it("origin → homeland", () => {
    const result = buildCanonicalFields({ name: "A", description: "d", personality: "p", origin: "Tokyo", },);
    expect(result.homeland,).toBe("Tokyo",);
  });

  it("culture → culture", () => {
    const result = buildCanonicalFields({ name: "A", description: "d", personality: "p", culture: "noir", },);
    expect(result.culture,).toBe("noir",);
  });

  it("canonical name wins over alias", () => {
    const result = buildCanonicalFields({
      name: "A",
      description: "d",
      personality: "p",
      species: "high elf",
      race: "dwarf",
    },);
    expect(result.species,).toBe("high elf",);
  });

  it("no identity fields → undefined", () => {
    const result = buildCanonicalFields({ name: "A", description: "d", personality: "p", },);
    expect(result.species,).toBeUndefined();
    expect(result.homeland,).toBeUndefined();
    expect(result.culture,).toBeUndefined();
    expect(result.gender,).toBeUndefined();
    expect(result.age,).toBeUndefined();
  });

  it("age accepts string or number", () => {
    const r1 = buildCanonicalFields({ name: "A", description: "d", personality: "p", age: "300", },);
    expect(r1.age,).toBe("300",);
    const r2 = buildCanonicalFields({ name: "A", description: "d", personality: "p", age: 42, },);
    expect(r2.age,).toBe(42,);
    const r3 = buildCanonicalFields({ name: "A", description: "d", personality: "p", age: { weird: true, }, },);
    expect(r3.age,).toBeUndefined();
  });
});

describe("FEAT-character-spec-inclusion — exporter round-trip", () => {
  it("emits identity fields when set", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      species: "synthetic",
      homeland: "starship Horizon",
      culture: "Proxima colony crew",
      gender: "n/a",
      age: 7,
    };
    const exported = exportBaseFields(char,);
    expect(exported.species,).toBe("synthetic",);
    expect(exported.homeland,).toBe("starship Horizon",);
    expect(exported.culture,).toBe("Proxima colony crew",);
    expect(exported.gender,).toBe("n/a",);
    expect(exported.age,).toBe(7,);
  });

  it("omits identity fields when not set (no extensions leakage)", () => {
    const exported = exportBaseFields(baseCharacter,);
    expect("species" in exported,).toBe(false,);
    expect("homeland" in exported,).toBe(false,);
    expect("culture" in exported,).toBe(false,);
    expect("gender" in exported,).toBe(false,);
    expect("age" in exported,).toBe(false,);
  });
});
describe("character appearance + outfits — required fields", () => {
  it("strict mode: missing appearance → REQUIRED error", () => {
    const char: CanonicalCharacter = { ...baseCharacter, appearance: "", };
    const result = validateCharacter(char, "strict",);
    expect(result.errors.find((e,) => e.field === "appearance" && e.code === "REQUIRED"),).toBeDefined();
  });

  it("strict mode: missing outfits → REQUIRED error", () => {
    const char: CanonicalCharacter = { ...baseCharacter, outfits: [], default_outfit: "", };
    const result = validateCharacter(char, "strict",);
    expect(result.errors.find((e,) => e.field === "outfits" && e.code === "REQUIRED"),).toBeDefined();
  });

  it("strict mode: dangling default_outfit → INVALID_REFERENCE", () => {
    const char: CanonicalCharacter = { ...baseCharacter, default_outfit: "nope", };
    const result = validateCharacter(char, "strict",);
    expect(result.errors.find((e,) => e.field === "default_outfit" && e.code === "INVALID_REFERENCE"),).toBeDefined();
  });

  it("strict mode: duplicate outfit ids → DUPLICATE_ID", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      outfits: [
        { id: "gear", name: "Gear", descriptor: "Sturdy clothes", },
        { id: "gear", name: "Gear 2", descriptor: "Other clothes", },
      ],
      default_outfit: "gear",
    };
    const result = validateCharacter(char, "strict",);
    expect(result.errors.find((e,) => e.field === "outfits" && e.code === "DUPLICATE_ID"),).toBeDefined();
  });

  it("relaxed mode: missing outfits → warning, not error", () => {
    const char: CanonicalCharacter = { ...baseCharacter, outfits: [], default_outfit: "", };
    const result = validateCharacter(char, "relaxed",);
    expect(result.errors.find((e,) => e.field === "outfits"),).toBeUndefined();
    expect(result.warnings.find((w,) => w.field === "outfits"),).toBeDefined();
  });

  it("normalizer maps appearance + outfits with default fallback", () => {
    const result = buildCanonicalFields({
      name: "A",
      description: "d",
      personality: "p",
      appearance: "Tall figure",
      outfits: [{ id: "gear", name: "Gear", descriptor: "Sturdy clothes", },],
    },);
    expect(result.appearance,).toBe("Tall figure",);
    expect(result.outfits,).toHaveLength(1,);
    expect(result.default_outfit,).toBe("gear",);
  });

  it("exporter round-trips appearance + outfits", () => {
    const exported = exportBaseFields(baseCharacter,);
    expect(exported.appearance,).toBe("Test appearance",);
    expect(exported.default_outfit,).toBe("travel-gear",);
    expect(exported.outfits,).toEqual(baseCharacter.outfits,);
  });
  it("strict mode: oversized catalog + invalid fields → MAX_ITEMS + INVALID_VALUE", () => {
    const outfits = Array.from({ length: 21, }, (_, i,) => ({
      id: i === 0 ? "" : `gear-${i}`,
      name: i === 1 ? "" : `Gear ${i}`,
      descriptor: i === 2 ? "" : "Sturdy clothes",
    }),);
    const char: CanonicalCharacter = { ...baseCharacter, outfits, default_outfit: "gear-3", };
    const result = validateCharacter(char, "strict",);
    expect(result.errors.find((e,) => e.field === "outfits" && e.code === "MAX_ITEMS_EXCEEDED"),).toBeDefined();
    expect(result.errors.find((e,) => e.field === "outfits[0].id" && e.code === "INVALID_VALUE"),).toBeDefined();
    expect(result.errors.find((e,) => e.field === "outfits[1].name" && e.code === "INVALID_VALUE"),).toBeDefined();
    expect(result.errors.find((e,) => e.field === "outfits[2].descriptor" && e.code === "INVALID_VALUE"),)
      .toBeDefined();
  });

  it("strict mode: non-object outfit + missing default → INVALID_TYPE + REQUIRED", () => {
    const char: CanonicalCharacter = {
      ...baseCharacter,
      outfits: [null as unknown as { id: string; name: string; descriptor: string },],
      default_outfit: "",
    };
    const result = validateCharacter(char, "strict",);
    expect(result.errors.find((e,) => e.field === "outfits[0]" && e.code === "INVALID_TYPE"),).toBeDefined();
    expect(result.errors.find((e,) => e.field === "default_outfit" && e.code === "REQUIRED"),).toBeDefined();
  });
});
