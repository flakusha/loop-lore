// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for typed upsert helpers.
 *
 * The helpers are thin Kysely wrappers, but the typing is the load-bearing
 * part of this refactor — every existing call site gets the typed surface
 * from here. We test against the in-memory SQLite test DB (matches the
 * dev/runtime dialect) and use the `users` table because it has a unique
 * index on `username` (migration 001).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";
import { createTestDb, } from "../test-utils/create-test-db";
import type { DB, } from "./schema";
import { insertUnique, upsertByUnique, upsertByUniqueWith, } from "./upsert-helpers";

describe("insertUnique", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns 'inserted' on first call and 'skipped' on duplicate conflict", async () => {
    const id1 = crypto.randomUUID();
    const first = await insertUnique(
      db,
      "users",
      {
        id: id1,
        username: `alice-${id1}`,
        display_name: "Alice",
      },
      ["username",],
    );
    expect(first,).toBe("inserted",);

    // Second call with the same unique column but a different id — the
    // insert is silently dropped because the username already exists.
    const id2 = crypto.randomUUID();
    const second = await insertUnique(
      db,
      "users",
      {
        id: id2,
        username: `alice-${id1}`, // collides with the row above
        display_name: "Alice Two",
      },
      ["username",],
    );
    expect(second,).toBe("skipped",);

    // Confirm only one row exists, and it has the first caller's id.
    const row = await db
      .selectFrom("users",)
      .select(["id", "display_name",],)
      .where("username", "=", `alice-${id1}`,)
      .executeTakeFirst();
    expect(row?.id,).toBe(id1,);
    expect(row?.display_name,).toBe("Alice",);
  });

  test("returns 'inserted' for distinct usernames", async () => {
    const username = `bob-${crypto.randomUUID()}`;
    const result = await insertUnique(
      db,
      "users",
      {
        id: crypto.randomUUID(),
        username,
        display_name: "Bob",
      },
      ["username",],
    );
    expect(result,).toBe("inserted",);
  });
});

describe("upsertByUnique", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("inserts a new row when no conflict", async () => {
    const username = `carol-${crypto.randomUUID()}`;
    await upsertByUnique(
      db,
      "users",
      {
        id: crypto.randomUUID(),
        username,
        display_name: "Carol",
        settings: '{"first":true}',
      },
      ["username",],
    );

    const row = await db
      .selectFrom("users",)
      .selectAll()
      .where("username", "=", username,)
      .executeTakeFirst();
    expect(row?.display_name,).toBe("Carol",);
    expect(row?.settings,).toBe('{"first":true}',);
  });

  test("updates ONLY the specified columns on conflict (preserves others)", async () => {
    const username = `dave-${crypto.randomUUID()}`;
    // Seed with explicit values for two non-conflict columns.
    await upsertByUnique(
      db,
      "users",
      {
        id: crypto.randomUUID(),
        username,
        display_name: "Dave",
        settings: '{"seed":true}',
      },
      ["username",],
    );

    // Upsert with the SAME conflict (username) but different display_name
    // and a different settings value. We restrict updateColumns to
    // ['display_name'] so the existing settings row should be preserved.
    await upsertByUnique(
      db,
      "users",
      {
        id: crypto.randomUUID(),
        username,
        display_name: "Dave Renamed",
        settings: '{"would_overwrite":true}',
      },
      ["username",],
      ["display_name",],
    );

    const row = await db
      .selectFrom("users",)
      .select(["display_name", "settings",],)
      .where("username", "=", username,)
      .executeTakeFirst();

    // display_name must reflect the upsert (column was in updateColumns).
    expect(row?.display_name,).toBe("Dave Renamed",);
    // settings must be the ORIGINAL value (column was NOT in updateColumns
    // — the upsert must NOT have overwritten it with excluded.settings).
    expect(row?.settings,).toBe('{"seed":true}',);
  });

  test("default updateColumns covers all non-conflict insert columns", async () => {
    // When updateColumns is omitted, every non-conflict column in `values`
    // should be set to excluded.<column>.
    const username = `erin-${crypto.randomUUID()}`;
    await upsertByUnique(
      db,
      "users",
      {
        id: crypto.randomUUID(),
        username,
        display_name: "Erin",
        settings: '{"v":1}',
      },
      ["username",],
    );

    await upsertByUnique(
      db,
      "users",
      {
        id: crypto.randomUUID(),
        username,
        display_name: "Erin Two",
        settings: '{"v":2}',
      },
      ["username",],
    );

    const row = await db
      .selectFrom("users",)
      .select(["display_name", "settings",],)
      .where("username", "=", username,)
      .executeTakeFirst();
    expect(row?.display_name,).toBe("Erin Two",);
    expect(row?.settings,).toBe('{"v":2}',);
  });
});

describe("upsertByUniqueWith", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
  },);
  afterAll(async () => {
    await db.destroy();
  },);
  test("supports custom update expressions (raw SQL arithmetic)", async () => {
    // Mirrors the original messages/reply.ts use site: on conflict, the
    // existing row's column gets `excluded.column + 1`. The helper must
    // accept this kind of expression via the updateSet map.
    //
    // We exercise it on `users` by bumping `format_version` (integer) on
    // conflict — same shape, smaller blast radius than messages.
    const username = `frank-${crypto.randomUUID()}`;

    // Seed row with format_version = 0 (schema default).
    await upsertByUnique(
      db,
      "users",
      {
        id: crypto.randomUUID(),
        username,
        display_name: "Frank",
      },
      ["username",],
    );

    // Bump format_version by +1 on conflict, leaving display_name alone.
    await upsertByUniqueWith(
      db,
      "users",
      {
        id: crypto.randomUUID(), // different id; collides on username
        username,
        display_name: "Frank Two",
      },
      ["username",],
      { format_version: sql`excluded.format_version + 1`, },
    );

    const row = await db
      .selectFrom("users",)
      .select(["display_name", "format_version",],)
      .where("username", "=", username,)
      .executeTakeFirst();
    // display_name should be untouched (we did not list it in updateSet).
    expect(row?.display_name,).toBe("Frank",);
    // format_version should be the bumped value (0 + 1 = 1).
    expect(row?.format_version,).toBe(1,);
  });
});
