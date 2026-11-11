// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card import -> export parity.
 *
 * The fields a card carries but the actor row has no column for - the card
 * tags and the card's own `extensions` blob - must survive the round trip,
 * and the lorebook activation mode must not be dropped on the way in.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { exportRoutes, } from "../characters/export";
import { handleImport, } from "./handle";

describe("card import/export parity", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "card-parity-user", "Card Parity User",);
    userId = (await db.selectFrom("users",).select("id",).where("username", "=", "card-parity-user",)
      .executeTakeFirstOrThrow()).id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("tags, card extensions and the lorebook activation mode survive the round trip", async () => {
    const card = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Aria",
        description: "A cheerful elf bard",
        personality: "Cheerful",
        appearance: "Silver hair",
        first_mes: "Greetings",
        tags: ["fantasy", "bard",],
        extensions: { depth_prompt: { prompt: "Speak in verse", }, },
        character_book: {
          name: "Aria's lore",
          entries: [
            { keys: ["song",], content: "She sings ballads", use_regex: true, enabled: true, insertion_order: 1, },
          ],
        },
      },
    };

    const fd = new FormData();
    fd.append("file", new File([JSON.stringify(card,),], "aria.json", { type: "application/json", },),);
    const res = await handleImport(
      new Request("http://localhost/api/import", { method: "POST", body: fd, },),
      db,
      userId,
    );

    expect(res.status,).toBe(201,);

    const actor = await db.selectFrom("actors",).select(["id", "settings",],).where("display_name", "=", "Aria",)
      .executeTakeFirstOrThrow();

    const settings = JSON.parse(actor.settings,) as Record<string, unknown>;
    expect(settings.tags,).toEqual(["fantasy", "bard",],);
    expect((settings.extensions as Record<string, unknown>).depth_prompt,).toEqual({ prompt: "Speak in verse", },);

    const lore = await db.selectFrom("actor_lore_entries",).select(["key_type",],).where("actor_id", "=", actor.id,)
      .executeTakeFirstOrThrow();

    expect(lore.key_type,).toBe("regex",);

    const app = new Elysia({ name: "card-parity-export", },)
      .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
      .use(exportRoutes({ database: db, },),) as unknown as Elysia;

    const exportRes = await app.handle(
      new Request(`http://localhost/api/actors/${actor.id}/export?format=ccv3`,),
    );

    expect(exportRes.status,).toBe(200,);

    const exported = (await exportRes.json()) as { data: Record<string, unknown> };
    expect(exported.data.tags,).toEqual(["fantasy", "bard",],);
    expect((exported.data.extensions as Record<string, unknown>).depth_prompt,).toEqual({ prompt: "Speak in verse", },);
    const book = exported.data.character_book as { entries: { use_regex?: boolean }[] };
    expect(book.entries[0]?.use_regex,).toBe(true,);
  });
});
