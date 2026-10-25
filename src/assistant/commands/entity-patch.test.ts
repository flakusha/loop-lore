// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the shared patch grammar (`entity-patch.ts`) — the parser
 * and the JSON-patch validator every B4 command shares.
 */
import { describe, expect, test, } from "bun:test";
import {
  formatPatch,
  locationEffects,
  parseEntityPatch,
  validateJsonPatch,
} from "./entity-patch";
import {
  CHARACTER_MODIFY_SPEC,
  ITEM_ADD_SPEC,
  ITEM_APPLY_SPEC,
  LOCATION_APPLY_SPEC,
  WORLD_APPLY_SPEC,
} from "./entity-patch-spec";

describe("parseEntityPatch", () => {
  test("parses quoted, numeric and boolean values", () => {
    const result = parseEntityPatch(
      `description="Rustic Tavern" value=12 stackable=true`,
      ITEM_ADD_SPEC,
      "item",
    );

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.patch,).toEqual({ description: "Rustic Tavern", value: 12, stackable: true, },);
  });

  test("keeps the last value of a repeated key", () => {
    const result = parseEntityPatch(`value=1 value=2`, ITEM_ADD_SPEC, "item",);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.patch,).toEqual({ value: 2, },);
  });

  test("rejects a field the spec does not allow", () => {
    const result = parseEntityPatch(`owner=me`, ITEM_ADD_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Unknown item field "owner"`,);
  });

  test("rejects a non-numeric value for a number field", () => {
    const result = parseEntityPatch(`value=twelve`, ITEM_ADD_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "value" expects a number`,);
  });

  test("rejects a non-boolean value for a boolean field", () => {
    const result = parseEntityPatch(`stackable=yes`, ITEM_ADD_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "stackable" expects true or false`,);
  });

  test("rejects a value outside an enum", () => {
    const result = parseEntityPatch(`rarity=mythic`, ITEM_APPLY_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "rarity" expects one of:`,);
  });

  test("rejects an empty id field", () => {
    const result = parseEntityPatch(`parentLocationId=""`, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "parentLocationId" expects an id`,);
  });

  test("rejects malformed JSON for a json-array field", () => {
    const result = parseEntityPatch(`connections=nope`, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "connections" expects JSON (an array)`,);
  });

  test("rejects a json-array that is not a list of strings", () => {
    const result = parseEntityPatch(`connections='[1]'`, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "connections" expects a JSON array of strings`,);
  });

  test("parses a json-array field", () => {
    const result = parseEntityPatch(`connections='["loc-1"]'`, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.patch,).toEqual({ connections: ["loc-1",], },);
  });

  test("rejects a json-object field that is not an object", () => {
    const result = parseEntityPatch(`properties='[1]'`, ITEM_APPLY_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "properties" expects a JSON object`,);
  });

  test("rejects a non-array effects member", () => {
    const result = parseEntityPatch(`properties='{"effects":"burn"}'`, ITEM_APPLY_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`expects "effects" to be a JSON array`,);
  });

  test("parses a json-object field with an effects array", () => {
    const result = parseEntityPatch(`properties='{"effects":["burn"]}'`, ITEM_APPLY_SPEC, "item",);

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.patch,).toEqual({ properties: { effects: ["burn",], }, },);
  });

  test("rejects input with no key=value pairs", () => {
    const result = parseEntityPatch(`just some words`, WORLD_APPLY_SPEC, "world",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain("No patch parsed",);
  });
});

describe("validateJsonPatch", () => {
  test("accepts a proposal that matches the spec", () => {
    const result = validateJsonPatch(
      { displayName: "Rin", personality: "gruff", },
      CHARACTER_MODIFY_SPEC,
      "character",
    );

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.patch,).toEqual({ displayName: "Rin", personality: "gruff", },);
  });

  test("rejects a field the spec does not allow", () => {
    const result = validateJsonPatch({ ownerId: "x", }, CHARACTER_MODIFY_SPEC, "character",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Unknown character field "ownerId"`,);
  });

  test("rejects a non-string for a string field", () => {
    const result = validateJsonPatch({ displayName: 7, }, CHARACTER_MODIFY_SPEC, "character",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "displayName" expects a string.`,);
  });

  test("rejects an empty id field", () => {
    const result = validateJsonPatch({ parentLocationId: "", }, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "parentLocationId" expects an id`,);
  });

  test("rejects a value outside an enum", () => {
    const result = validateJsonPatch({ kind: "nonsense", }, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "kind" expects one of:`,);
  });

  test("rejects a non-number for a number field", () => {
    const result = validateJsonPatch({ coordX: "12", }, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "coordX" expects a number.`,);
  });

  test("rejects a non-boolean for a boolean field", () => {
    const result = validateJsonPatch({ stackable: "true", }, ITEM_ADD_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "stackable" expects true or false.`,);
  });

  test("rejects a non-array for a json-array field", () => {
    const result = validateJsonPatch({ connections: "loc-1", }, LOCATION_APPLY_SPEC, "location",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "connections" expects a JSON array of strings.`,);
  });

  test("rejects a non-object for a json-object field", () => {
    const result = validateJsonPatch({ properties: ["burn",], }, ITEM_APPLY_SPEC, "item",);

    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.error,).toContain(`Field "properties" expects a JSON object.`,);
  });
});

describe("formatPatch", () => {
  test("renders a string value verbatim and an object value as JSON", () => {
    const rendered = formatPatch({ description: "A gate", properties: { effects: ["burn",], }, },);

    expect(rendered,).toBe('- **description** → A gate\n- **properties** → {"effects":["burn"]}',);
  });
});

describe("locationEffects", () => {
  test("describes a reparent and a connection replacement", () => {
    const effects = locationEffects({ parentLocationId: "loc-1", connections: ["loc-2",], },);

    expect(effects,).toHaveLength(2,);
    expect(effects[0],).toContain("Reparents this location under **loc-1**",);
    expect(effects[1],).toContain("Replaces the travel connections",);
  });

  test("reports no effects for an unrelated patch", () => {
    expect(locationEffects({ description: "A gate", },),).toEqual([],);
  });
});
