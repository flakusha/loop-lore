import { describe, expect, test, } from "bun:test";
import {
  FANTASY_RPG_REQUIREMENTS,
  getRequirementsForBundle,
  validateCharacterForBundle,
} from "./bundles";
import type { BundleCharacterRequirements, PluginManifest, } from "./types";

// A fantasy-rpg character fixture mirroring the spec's example. Snapshot test
// guards against accidental field renames (the spec lists these by name).
const FANTASY_RPG_FIXTURE: Record<string, unknown> = {
  name: "Aldric of Elderwood",
  description: "Veteran guard of the Elderwood Keep.",
  personality: "Stoic, loyal, terse.",
  appearance: "Tall, scarred, grey-streaked beard.",
  default_outfit: "guard-armor",
  outfits: [{ id: "guard-armor", label: "Guard armor", description: "Worn steel.", },],
  extensions: {
    plugin_bundle: "fantasy-rpg",
    abilities: { strength: 15, dexterity: 11, constitution: 14, intelligence: 10, wisdom: 13, charisma: 12, },
    inventory: [{ id: "longsword", name: "Longsword", type: "weapon", description: "+", quantity: 1, equipped: true, },],
    relationships: [{ target_character_id: "lyra", type: "ally", strength: 60, },],
    alignment: "lawful good",
    languages: ["Common", "Elvish",],
  },
};

describe("validateCharacterForBundle", () => {
  test("fantasy-rpg fixture passes: abilities + inventory ≥ 1", () => {
    const ext = FANTASY_RPG_FIXTURE.extensions as Record<string, unknown>;
    const result = validateCharacterForBundle(ext, FANTASY_RPG_REQUIREMENTS,);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([],);
  },);

  test("missing abilities → reports 'required: abilities'", () => {
    const ext = { plugin_bundle: "fantasy-rpg", inventory: [{ id: "x", name: "X", type: "misc", description: "-", quantity: 1, equipped: false, },], };
    const result = validateCharacterForBundle(ext, FANTASY_RPG_REQUIREMENTS,);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("required: abilities");
  },);

  test("empty inventory → reports 'minLength: inventory < 1'", () => {
    const ext = { plugin_bundle: "fantasy-rpg", abilities: { strength: 10, }, inventory: [], };
    const result = validateCharacterForBundle(ext, FANTASY_RPG_REQUIREMENTS,);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("minLength: inventory < 1");
  },);

  test("inventory present but not an array → reports 'minLength: inventory (not an array)'", () => {
    const ext = { plugin_bundle: "fantasy-rpg", abilities: { strength: 10, }, inventory: "sword", };
    const result = validateCharacterForBundle(ext, FANTASY_RPG_REQUIREMENTS,);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("minLength: inventory (not an array)");
  },);

  test("undefined extensions is treated as empty (no throw)", () => {
    const result = validateCharacterForBundle(undefined, FANTASY_RPG_REQUIREMENTS,);
    expect(result.valid).toBe(false);
    expect(result.missing.length,).toBeGreaterThan(0);
  },);

  test("undefined requirements → always valid", () => {
    const result = validateCharacterForBundle({}, undefined,);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([],);
  },);

  test("custom requirements: requires motivations and equipment", () => {
    const reqs: BundleCharacterRequirements = {
      required: ["motivations", "equipment",],
      minLength: { motivations: 1, },
    };
    const ok = validateCharacterForBundle(
      { motivations: [{ summary: "guard the keep", }], equipment: { main_hand: "longsword", }, },
      reqs,
    );
    expect(ok.valid).toBe(true);

    const missingEq = validateCharacterForBundle(
      { motivations: [{ summary: "guard the keep", }], },
      reqs,
    );
    expect(missingEq.valid).toBe(false);
    expect(missingEq.missing).toContain("required: equipment");
  },);
});

describe("getRequirementsForBundle", () => {
  test("fantasy-rpg → FANTASY_RPG_REQUIREMENTS", () => {
    expect(getRequirementsForBundle("fantasy-rpg")).toBe(FANTASY_RPG_REQUIREMENTS,);
  },);

  test("unknown bundle id → undefined", () => {
    expect(getRequirementsForBundle("sci-fi-horror")).toBeUndefined();
  },);

  test("undefined bundle id → undefined", () => {
    expect(getRequirementsForBundle(undefined)).toBeUndefined();
  },);
});

describe("PluginManifest.characterRequirements", () => {
  test("manifest can declare per-bundle requirements", () => {
    // Type-only assertion: a manifest with characterRequirements compiles.
    const manifest: PluginManifest = {
      name: "fantasy-rpg-bundle",
      version: "1.0.0",
      description: "Fantasy RPG character bundle",
      author: "loop-lore",
      characterRequirements: {
        "fantasy-rpg": FANTASY_RPG_REQUIREMENTS,
      },
    };
    expect(manifest.characterRequirements?.["fantasy-rpg"]).toBe(FANTASY_RPG_REQUIREMENTS,);
  },);
});
