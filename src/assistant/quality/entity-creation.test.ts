// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  ENTITY_KIND_ALIASES,
  resolveEntityGenerationPrompt,
  VALID_ENTITY_TOKENS,
} from "../prompt/templates/entity-generation";
import type {
  GeneratedEntityLoreEntry,
} from "./entity-creation";
import {
  checkConsistency,
  checkDuplicate,
  normalizeEntity,
  normalizeLoreEntries,
  runQualityGates,
  validateEntitySchema,
  validateLoreEntries,
  validateRawLoreEntries,
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

describe("normalizeLoreEntries", () => {
  it("normalizes valid structured lore entries", () => {
    const raw = [
      {
        name: "The Betrayer",
        content: "Once a hero, now a villain.",
        keys: ["betrayer", "hero",],
        subject: { kind: "race", race: "elf", },
        constant: false,
        selective: true,
        position: "before_char",
        insertion_order: 1,
        priority: 5,
      },
    ];
    const entries = normalizeLoreEntries(raw,);
    expect(entries,).toHaveLength(1,);
    expect(entries[0]!.name,).toBe("The Betrayer",);
    expect(entries[0]!.content,).toBe("Once a hero, now a villain.",);
    expect(entries[0]!.keys,).toEqual(["betrayer", "hero",],);
    expect(entries[0]!.subject,).toEqual({ kind: "race", race: "elf", },);
    expect(entries[0]!.requires_presence,).toBeUndefined();
    expect(entries[0]!.constant,).toBe(false,);
    expect(entries[0]!.selective,).toBe(true,);
    expect(entries[0]!.position,).toBe("before_char",);
    expect(entries[0]!.insertion_order,).toBe(1,);
    expect(entries[0]!.priority,).toBe(5,);
  });

  it("skips entries missing name or content", () => {
    const raw = [
      { name: "Valid", content: "Valid content", },
      { name: "", content: "No name", },
      { name: "No content", content: "", },
      { content: "Missing name field", },
      { name: "Missing content", },
      null,
      "not an object",
    ];
    const entries = normalizeLoreEntries(raw,);
    expect(entries,).toHaveLength(1,);
    expect(entries[0]!.name,).toBe("Valid",);
  });

  it("clamps keys to max 5 entries and max 100 chars", () => {
    const longKey = "a".repeat(200,);
    const raw = [
      {
        name: "Test",
        content: "Content",
        keys: [longKey, "b", "c", "d", "e", "f", "g", "h",],
      },
    ];
    const entries = normalizeLoreEntries(raw,);
    expect(entries[0]!.keys,).toHaveLength(5,);
    expect(entries[0]!.keys![0]!.length,).toBe(100,);
    expect(entries[0]!.keys![1]!,).toBe("b",);
    expect(entries[0]!.keys![4]!,).toBe("e",);
  });

  it("clamps numeric fields to valid ranges", () => {
    const raw = [
      {
        name: "Test",
        content: "Content",
        insertion_order: -5,
        priority: 9999,
        cooldown_seconds: -10,
      },
    ];
    const entries = normalizeLoreEntries(raw,);
    expect(entries[0]!.insertion_order,).toBe(0,);
    expect(entries[0]!.priority,).toBe(999,);
    expect(entries[0]!.cooldown_seconds,).toBe(0,);
  });
});

describe("validateRawLoreEntries", () => {
  it("returns empty array for valid raw entries", () => {
    const raw = [{
      name: "Test",
      content: "Content",
      keys: ["a", "b",],
      subject: { kind: "world", },
      position: "before_char",
    },];
    expect(validateRawLoreEntries(raw,),).toHaveLength(0,);
  });

  it("reports missing name and content", () => {
    const raw = [{ content: "c", }, { name: "n", },];
    const errors = validateRawLoreEntries(raw,);
    expect(errors,).toContain("lore[0].name is required",);
    expect(errors,).toContain("lore[1].content is required",);
  });

  it("reports keys exceeding max entries before clamping", () => {
    const raw = [{
      name: "T",
      content: "c",
      keys: Array(6,).fill("x",),
    },];
    const errors = validateRawLoreEntries(raw,);
    expect(errors,).toContain("lore[0].keys exceeds 5 entries",);
  });

  it("reports keys exceeding max length before clamping", () => {
    const raw = [{
      name: "T",
      content: "c",
      keys: ["a".repeat(200,),],
    },];
    const errors = validateRawLoreEntries(raw,);
    expect(errors,).toContain("lore[0].keys[0] must be a string of at most 100 characters",);
  });

  it("reports unknown subject kind", () => {
    const raw = [{
      name: "T",
      content: "c",
      subject: { kind: "bogus", },
    },];
    const errors = validateRawLoreEntries(raw,);
    expect(errors,).toContain("lore[0].subject is invalid or has incomplete selectors",);
  });

  it("reports incomplete subject selectors", () => {
    const raw: unknown[] = [
      { name: "T", content: "c", subject: { kind: "profession", }, },
      { name: "T", content: "c", subject: { kind: "race", }, },
      { name: "T", content: "c", subject: { kind: "location", locationId: "not-a-uuid", }, },
    ];
    const errors = validateRawLoreEntries(raw,);
    expect(errors.some(e => e.includes("lore[0].subject",)),).toBe(true,);
    expect(errors.some(e => e.includes("lore[1].subject",)),).toBe(true,);
    expect(errors.some(e => e.includes("lore[2].subject",)),).toBe(true,);
  });

  it("reports invalid position before stripping", () => {
    const raw = [{
      name: "T",
      content: "c",
      position: "bad",
    },];
    const errors = validateRawLoreEntries(raw,);
    expect(errors,).toContain("lore[0].position is not a valid LorePosition",);
  });

  it("reports non-object entries", () => {
    const raw: unknown[] = [null, "string", 42,];
    const errors = validateRawLoreEntries(raw,);
    expect(errors.some(e => e.includes("lore[0] is not a valid object",)),).toBe(true,);
    expect(errors.some(e => e.includes("lore[1] is not a valid object",)),).toBe(true,);
    expect(errors.some(e => e.includes("lore[2] is not a valid object",)),).toBe(true,);
  });
});

describe("validateLoreEntries", () => {
  it("returns empty array for valid entries", () => {
    const entries: GeneratedEntityLoreEntry[] = [{
      name: "Test",
      content: "Content",
      keys: ["a", "b",],
      subject: { kind: "world", } as const,
      position: "before_char",
    },];
    const errors = validateLoreEntries(entries,);
    expect(errors,).toHaveLength(0,);
  });

  it("reports missing name and content", () => {
    const entries: GeneratedEntityLoreEntry[] = [{
      name: "",
      content: "",
    },];
    const errors = validateLoreEntries(entries,);
    expect(errors,).toContain("lore[0].name is required",);
    expect(errors,).toContain("lore[0].content is required",);
  });

  it("reports keys exceeding max entries", () => {
    const entries: GeneratedEntityLoreEntry[] = [{
      name: "T",
      content: "c",
      keys: Array(6,).fill("x",),
    },];
    const errors = validateLoreEntries(entries,);
    expect(errors,).toContain("lore[0].keys exceeds 5 entries",);
  });

  it("reports unknown subject kind", () => {
    const entries = [{
      name: "T",
      content: "c",
      subject: { kind: "bogus", } as never,
      position: "before_char" as const,
    },];
    const errors = validateLoreEntries(entries,);
    expect(errors,).toContain("lore[0].subject.kind is not a known subject kind",);
  });

  it("reports invalid position", () => {
    const entries = [{
      name: "T",
      content: "c",
      position: "bad" as never,
    },];
    const errors = validateLoreEntries(entries,);
    expect(errors,).toContain("lore[0].position is not a valid LorePosition",);
  });
});

describe("normalizeEntity (structured lore)", () => {
  it("normalizes array lore into lore entries", () => {
    const raw = {
      name: "Test",
      description: "desc",
      lore: [{ name: "L", content: "C", },],
    };
    const entity = normalizeEntity(raw,);
    expect(Array.isArray(entity.lore,),).toBe(true,);
    const loreArr = entity.lore as GeneratedEntityLoreEntry[];
    expect(loreArr[0]!.name,).toBe("L",);
  });

  it("keeps string lore as-is for backward compat", () => {
    const entity = normalizeEntity({
      name: "T",
      description: "d",
      lore: "A long time ago...",
    },);
    expect(entity.lore,).toBe("A long time ago...",);
  });

  it("drops non-array, non-string lore", () => {
    const entity = normalizeEntity({
      name: "T",
      description: "d",
      lore: 42,
    },);
    expect(entity.lore,).toBeUndefined();
  });
});

describe("resolveEntityGenerationPrompt", () => {
  it("returns the built-in default prompt with the description embedded", () => {
    const p = resolveEntityGenerationPrompt(undefined, "character", "a wizard",);
    expect(p,).toContain("a wizard",);
    expect(p,).toContain("JSON",);
  });

  it("includes lore schema and example for all 4 kinds", () => {
    for (const kind of ["character", "location", "world", "item",] as const) {
      const p = resolveEntityGenerationPrompt(undefined, kind, "test desc",);
      expect(p,).toContain("lore",);
      expect(p,).toContain("Example:",);
    }
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
