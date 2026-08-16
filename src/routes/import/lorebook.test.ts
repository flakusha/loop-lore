/**
 * Tests for lorebook import mapping (character card → actor_lore_entries).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { LorebookData, } from "../../characters/spec";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { importLorebook, } from "./lorebook";

function lorebook(entries: LorebookData["entries"],): LorebookData {
  return { entries, };
}

describe("importLorebook", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertActors(db, "Card Char", { id: "char-1" as never, actor_type: "character" as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns zero when lorebook has no entries", async () => {
    const warnings: string[] = [];
    expect(await importLorebook(db, "char-1", lorebook([],), warnings,),).toBe(0,);
    expect(warnings,).toHaveLength(0,);
  });

  test("imports entries with mapped fields", async () => {
    const warnings: string[] = [];
    const count = await importLorebook(
      db,
      "char-1",
      lorebook([{
        id: 1,
        name: "Kingdom",
        content: "A kingdom.",
        keys: ["kingdom", "realm",],
        selective: true,
        case_sensitive: false,
        enabled: true,
        constant: false,
        position: "before_char",
        insertion_order: 5,
        priority: 3,
        comment: "main lore",
      },],),
      warnings,
    );
    expect(count,).toBe(1,);
    expect(warnings,).toHaveLength(0,);

    const row = await db.selectFrom("actor_lore_entries",).selectAll().where("actor_id", "=", "char-1",)
      .executeTakeFirst();
    expect(row!.name,).toBe("Kingdom",);
    expect(row!.content,).toBe("A kingdom.",);
    expect(row!.keys,).toContain("kingdom",);
    expect(row!.selective,).toBe(1,);
    expect(row!.case_sensitive,).toBe(0,);
    expect(row!.enabled,).toBe("enabled",);
    expect(row!.constant,).toBe(0,);
    expect(row!.position,).toBe("before_char",);
    expect(row!.insertion_order,).toBe(5,);
    expect(row!.priority,).toBe(3,);
    expect(row!.comment,).toBe("main lore",);
    expect(row!.sort_order,).toBe(1,);
  });

  test("maps disabled and defaulted fields", async () => {
    const warnings: string[] = [];
    await importLorebook(
      db,
      "char-1",
      lorebook([{
        id: 2,
        name: undefined as never,
        content: "No name",
        keys: [],
        selective: false,
        case_sensitive: false,
        enabled: false,
        constant: true,
        position: "after_char",
        insertion_order: 0,
        priority: 0,
      },],),
      warnings,
    );
    const rows = await db.selectFrom("actor_lore_entries",).selectAll().where("actor_id", "=", "char-1",).orderBy(
      "sort_order",
      "asc",
    ).execute();
    const row = rows[1]!;
    expect(row.name,).toBeNull();
    expect(row.enabled,).toBe("disabled",);
    expect(row.constant,).toBe(1,);
    expect(row.keys,).toBe("[]",);
    expect(row.sort_order,).toBe(2,);
  });

  test("collects warnings for failing entries but continues", async () => {
    const warnings: string[] = [];
    const count = await importLorebook(
      db,
      "char-1",
      lorebook([
        {
          id: 3,
          name: "Bad",
          content: "x",
          keys: [],
          position: "before_char",
          insertion_order: 0,
          priority: 0,
          enabled: true,
          case_sensitive: false,
          selective: false,
          constant: false,
        },
        {
          id: 4,
          name: "Ok",
          content: "y",
          keys: ["k",],
          position: "before_char",
          insertion_order: 1,
          priority: 1,
          enabled: true,
          case_sensitive: false,
          selective: false,
          constant: false,
        },
      ],),
      warnings,
    );
    expect(count,).toBe(2,);
    // FK failure when actor is missing
    const warnings2: string[] = [];
    await importLorebook(
      db,
      "missing-actor",
      lorebook([{
        id: 5,
        name: "Orphan",
        content: "z",
        keys: [],
        position: "before_char",
        insertion_order: 0,
        priority: 0,
        enabled: true,
        case_sensitive: false,
        selective: false,
        constant: false,
      },],),
      warnings2,
    );
    expect(warnings2,).toHaveLength(1,);
    expect(warnings2[0],).toContain("Failed to import lore entry",);
    expect(warnings2[0],).toContain("Orphan",);
  });
});
