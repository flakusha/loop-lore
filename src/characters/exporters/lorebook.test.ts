// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
//
// Round-trip cover for the actor lorebook export epilogue: an imported
// `character_book` must come back out on export.

import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { importLorebook, } from "../../routes/import/lorebook";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { LorebookData, } from "../spec";
import { exportToCcV3Json, } from "./ccv3";
import { exportActorLorebook, exportActorLorebooks, } from "./lorebook";

const ACTOR_ID = "lore-export-actor";

const LOREBOOK: LorebookData = {
  entries: [
    {
      keys: ["kingdom", "realm",],
      content: "A kingdom of glass towers.",
      enabled: true,
      insertion_order: 1,
      case_sensitive: false,
      name: "Kingdom",
      priority: 5,
      id: 0,
      comment: "world primer",
      selective: false,
      constant: false,
      position: "before_char",
    },
    {
      keys: ["dragon",],
      content: "Dragons sleep under the northern ice.",
      enabled: false,
      insertion_order: 2,
      case_sensitive: true,
      name: "Dragon",
      priority: 1,
      id: 1,
      selective: true,
      constant: true,
      position: "after_char",
    },
  ],
};

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await db.insertInto("actors",).values({
    id: ACTOR_ID,
    actor_type: "character",
    display_name: "Lorekeeper",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    agent_type: "none",
    row_version: 0,
  } as never,).execute();
},);

/** Import the fixture lorebook, returning the number of stored rows. */
async function seedLorebook(): Promise<number> {
  await db.deleteFrom("actor_lore_entries",).where("actor_id", "=", ACTOR_ID,).execute();
  const warnings: string[] = [];
  const imported = await importLorebook(db, ACTOR_ID, LOREBOOK, warnings,);
  expect(warnings,).toEqual([],);
  return imported;
}

describe("exportActorLorebook", () => {
  test("returns undefined for an actor with no lore entries", async () => {
    await db.deleteFrom("actor_lore_entries",).where("actor_id", "=", ACTOR_ID,).execute();
    expect(await exportActorLorebook(db, ACTOR_ID,),).toBeUndefined();
  });

  test("round-trips an imported lorebook through CCv3 character_book", async () => {
    expect(await seedLorebook(),).toBe(2,);

    const lorebook = await exportActorLorebook(db, ACTOR_ID,);
    expect(lorebook?.entries,).toHaveLength(2,);

    const card = JSON.parse(
      exportToCcV3Json({
        name: "Lorekeeper",
        description: "",
        personality: "",
        appearance: "",
        default_outfit: "",
        outfits: [],
        lorebook,
      },),
    );

    const entries = card.data.character_book.entries as Record<string, unknown>[];
    expect(entries,).toHaveLength(2,);
    expect(entries[0]?.name,).toBe("Kingdom",);
    expect(entries[0]?.keys,).toEqual(["kingdom", "realm",],);
    expect(entries[0]?.enabled,).toBe(true,);
    expect(entries[0]?.case_sensitive,).toBe(false,);
    expect(entries[0]?.comment,).toBe("world primer",);
    expect(entries[1]?.name,).toBe("Dragon",);
    expect(entries[1]?.enabled,).toBe(false,);
    expect(entries[1]?.selective,).toBe(true,);
    expect(entries[1]?.constant,).toBe(true,);
    expect(entries[1]?.position,).toBe("after_char",);
  });

  test("bulk lookup groups entries by actor", async () => {
    await seedLorebook();
    const map = await exportActorLorebooks(db, [ACTOR_ID, "missing-actor",],);

    expect([...map.keys(),],).toEqual([ACTOR_ID,],);
    expect(map.get(ACTOR_ID,)?.entries,).toHaveLength(2,);
  });
});
