// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Anonymous/guest/owner/admin coverage for the worlds list + search fragments.
 *
 * Regression test for the anon leak: the views auth derive leaves `userId`
 * null instead of 401ing, so both fragments must filter every viewer arm —
 * no identity matches nothing, the guest tier sees public worlds only.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { WorldVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { visibleWorldsTo, } from "./access";
import { serveWorldsSearch, } from "./search";
import { serveWorldsListDb, } from "./worlds";

describe("views/worlds anon access", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertWorlds(db, "owner", "Public World", {
      id: "w-public" as never,
      visibility: WorldVisibility.Public,
    },);

    await insertWorlds(db, "owner", "Private World", {
      id: "w-private" as never,
      visibility: WorldVisibility.Private,
    },);

    await insertWorlds(db, "owner", "Unlisted World", {
      id: "w-unlisted" as never,
      visibility: WorldVisibility.Unlisted,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("anonymous list matches nothing", async () => {
    const html = await (await serveWorldsListDb(db, null, null,)).text();
    expect(html,).not.toContain("world-card-w-public",);
    expect(html,).not.toContain("world-card-w-private",);
    expect(html,).toContain("No worlds found",);
  });

  test("anonymous search matches nothing", async () => {
    const html = await (await serveWorldsSearch(db, new URLSearchParams(), null, null,)).text();
    expect(html,).not.toContain("world-card-w-public",);
    expect(html,).not.toContain("world-card-w-private",);
  });

  test("guest tier sees the public world only", async () => {
    const listHtml = await (await serveWorldsListDb(db, null, "guest",)).text();
    expect(listHtml,).toContain("world-card-w-public",);
    expect(listHtml,).not.toContain("world-card-w-private",);
    expect(listHtml,).not.toContain("world-card-w-unlisted",);

    const searchHtml = await (await serveWorldsSearch(db, new URLSearchParams(), null, "guest",)).text();
    expect(searchHtml,).toContain("world-card-w-public",);
    expect(searchHtml,).not.toContain("world-card-w-private",);
    expect(searchHtml,).not.toContain("world-card-w-unlisted",);
  });

  test("authenticated stranger sees none of the owner's worlds", async () => {
    const html = await (await serveWorldsSearch(db, new URLSearchParams(), "stranger", "user",)).text();
    expect(html,).not.toContain("world-card-w-public",);
    expect(html,).not.toContain("world-card-w-private",);
    expect(html,).not.toContain("world-card-w-unlisted",);
  });

  test("owner sees own worlds", async () => {
    const html = await (await serveWorldsListDb(db, "owner", "user",)).text();
    expect(html,).toContain("world-card-w-public",);
    expect(html,).toContain("world-card-w-private",);
  });

  test("admin sees all worlds", async () => {
    const html = await (await serveWorldsSearch(db, new URLSearchParams(), "owner", "admin",)).text();
    expect(html,).toContain("world-card-w-public",);
    expect(html,).toContain("world-card-w-private",);
  });

  test("visibleWorldsTo filters every viewer arm", async () => {
    const ids = (userId: string | null, userRole: string | null,): Promise<string[]> =>
      db.selectFrom("worlds",)
        .select("worlds.id",)
        .where(visibleWorldsTo({ userId, userRole, },),)
        .execute()
        .then((rows,) => rows.map((r,) => r.id).sort());

    expect(await ids(null, null,),).toEqual([],);
    expect(await ids(null, "guest",),).toEqual(["w-public",],);
    expect(await ids("stranger", "user",),).toEqual([],);
    expect(await ids("owner", "user",),).toEqual(["w-private", "w-public", "w-unlisted",],);
    expect(await ids("owner", "admin",),).toEqual(["w-private", "w-public", "w-unlisted",],);
  });
});
