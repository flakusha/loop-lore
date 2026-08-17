// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  ENTITY_KIND_ALIASES,
  resolveEntityGenerationPrompt,
  VALID_ENTITY_TOKENS,
} from "../prompt/templates/entity-generation";
import {
  checkConsistency,
  checkDuplicate,
  normalizeEntity,
  runQualityGates,
  validateEntitySchema,
} from "./entity-creation";

describe("normalizeEntity", () => {
  it("trims and drops empty optional fields", () => {
    const e = normalizeEntity({ name: "  Gimli ", description: "  dwarf ", personality: "", scenario: null, },);
    expect(e.name,).toBe("Gimli",);
    expect(e.description,).toBe("dwarf",);
    expect(e.personality,).toBeUndefined();
    expect(e.scenario,).toBeUndefined();
  });

  it("falls back to empty name when missing", () => {
    expect(normalizeEntity({},).name,).toBe("",);
  });
});

describe("validateEntitySchema", () => {
  it("accepts a complete entity", () => {
    expect(validateEntitySchema("character", { name: "A", description: "B", },).ok,).toBe(true,);
  });

  it("rejects missing required fields", () => {
    const r = validateEntitySchema("character", { name: "A", },);
    expect(r.ok,).toBe(false,);
    expect(r.message,).toContain("description",);
  });
});

describe("checkConsistency", () => {
  it("warns when location has no description but world context exists", () => {
    const c = checkConsistency("location", { name: "X", }, { name: "Midgard", description: "realm", },);
    expect(c.warnings.length,).toBe(1,);
  });

  it("passes silently for character kind", () => {
    expect(checkConsistency("character", { name: "X", description: "y", },).warnings,).toHaveLength(0,);
  });
});

describe("checkDuplicate (DB-backed)", () => {
  it("flags an existing same-scope entity by name (case-insensitive)", async () => {
    const { db, } = await createTestDb();
    await db.insertInto("users",)
      .values({
        id: "u1",
        username: "owner",
        display_name: "Owner",
        password_hash: null,
        role: "user",
        status: "active",
        settings: "{}",
        format_version: 1,
      },)
      .execute();
    await db.insertInto("actors",)
      .values({
        id: "a1",
        actor_type: "character",
        display_name: "Frodo",
        owner_id: "u1",
        user_id: "u1",
        agent_type: "ai",
        settings: "{}",
        import_spec: "manual",
      },)
      .execute();

    const hit = await checkDuplicate(db, "character", { name: "frodo", }, { ownerId: "u1", },);
    expect(hit.found,).toBe(true,);
    expect(hit.existingId,).toBe("a1",);

    const miss = await checkDuplicate(db, "character", { name: "Sam", }, { ownerId: "u1", },);
    expect(miss.found,).toBe(false,);
  });

  it("scopes items by world_id", async () => {
    const { db, } = await createTestDb();
    await db.insertInto("users",)
      .values({
        id: "u1",
        username: "owner",
        display_name: "Owner",
        password_hash: null,
        role: "user",
        status: "active",
        settings: "{}",
        format_version: 1,
      },)
      .execute();
    await db.insertInto("worlds",)
      .values({
        id: "w1",
        owner_id: "u1",
        name: "W1",
        kind: "rpg",
        visibility: "private",
        scan_depth: 1,
        token_budget: 1000,
        difficulty_modifier: 0,
      },)
      .execute();
    await db.insertInto("worlds",)
      .values({
        id: "w2",
        owner_id: "u1",
        name: "W2",
        kind: "rpg",
        visibility: "private",
        scan_depth: 1,
        token_budget: 1000,
        difficulty_modifier: 0,
      },)
      .execute();
    await db.insertInto("items",)
      .values({
        id: "i1",
        world_id: "w1",
        name: "Ring",
        category: "other",
        rarity: "common",
        stackable: "unique",
        max_stack: 1,
        properties: "{}",
      },)
      .execute();

    const sameWorld = await checkDuplicate(db, "item", { name: "ring", }, { ownerId: "u1", worldId: "w1", },);
    expect(sameWorld.found,).toBe(true,);
    const otherWorld = await checkDuplicate(db, "item", { name: "ring", }, { ownerId: "u1", worldId: "w2", },);
    expect(otherWorld.found,).toBe(false,);
  });
});

describe("runQualityGates", () => {
  it("skips duplicate/consistency when schema fails", async () => {
    const { db, } = await createTestDb();
    const report = await runQualityGates(
      db,
      "character",
      { name: "", description: "", },
      { ownerId: "u1", },
    );
    expect(report.schema.ok,).toBe(false,);
    expect(report.duplicate.found,).toBe(false,);
  });

  it("runs all gates for a valid entity", async () => {
    const { db, } = await createTestDb();
    const report = await runQualityGates(
      db,
      "world",
      { name: "Valinor", description: "blessed land", },
      { ownerId: "u1", },
    );
    expect(report.schema.ok,).toBe(true,);
    expect(report.duplicate.found,).toBe(false,);
    expect(report.consistency.warnings,).toHaveLength(0,);
  });
});

describe("resolveEntityGenerationPrompt", () => {
  it("returns the built-in default prompt with the description embedded", () => {
    const p = resolveEntityGenerationPrompt(undefined, "character", "a wizard",);
    expect(p,).toContain("a wizard",);
    expect(p,).toContain("JSON",);
  });

  it("uses the config override verbatim when present", () => {
    const config = {
      templates: { llm: { entityGeneration: { character: "MAKE {description} NOW", }, }, },
    } as never;
    const p = resolveEntityGenerationPrompt(config, "character", "a rogue",);
    expect(p,).toBe("MAKE a rogue NOW",);
  });

  it("appends description when override lacks the placeholder", () => {
    const config = {
      templates: { llm: { entityGeneration: { item: "Invent something", }, }, },
    } as never;
    const p = resolveEntityGenerationPrompt(config, "item", "a sword",);
    expect(p,).toContain("Invent something",);
    expect(p,).toContain("a sword",);
  });
});

describe("entity token aliases", () => {
  it("maps all valid tokens to canonical kinds", () => {
    for (const token of VALID_ENTITY_TOKENS) {
      expect(ENTITY_KIND_ALIASES[token],).toBeDefined();
    }
  });
});
