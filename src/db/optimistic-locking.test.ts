// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for optimistic concurrency control helpers.
 *
 * Uses the `actors` table: it has `format_version` + `updated_at` and is the
 * production caller's table (see routes/characters/update.ts).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../test-utils/create-test-db";
import { getCurrentVersion, updateWithVersionCheck, updateWithVersionCheckRaw, } from "./optimistic-locking";
import type { DB, } from "./schema";

const OLD_TIMESTAMP = "2020-01-01T00:00:00.000Z";

async function insertActor(db: Kysely<DB>, id: string,): Promise<void> {
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: "Original",
      user_id: null,
      owner_id: null,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
      updated_at: OLD_TIMESTAMP,
    },)
    .execute();
}

describe("updateWithVersionCheck", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    ({ db, } = await createTestDb());
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  it("applies the update, bumps format_version and updated_at", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheck(db, "actors", "a1", 0, { display_name: "Updated", },);
    expect(result,).toEqual({ ok: true, rowsAffected: 1, },);
    const row = await db.selectFrom("actors",).select(["display_name", "format_version", "updated_at",],).where(
      "id",
      "=",
      "a1",
    ).executeTakeFirst();

    expect(row?.display_name,).toBe("Updated",);
    expect(row?.format_version,).toBe(1,);
    expect(row?.updated_at,).not.toBe(OLD_TIMESTAMP,);
  });

  it("rejects a stale version and leaves the row untouched", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheck(db, "actors", "a1", 7, { display_name: "Stale", },);
    expect(result,).toEqual({
      ok: false,
      rowsAffected: 0,
      error: "Version conflict: record was modified by another process",
    },);

    const row = await db.selectFrom("actors",).select(["display_name", "format_version",],).where("id", "=", "a1",)
      .executeTakeFirst();

    expect(row?.display_name,).toBe("Original",);
    expect(row?.format_version,).toBe(0,);
  });

  it("reports a conflict for a missing row", async () => {
    const result = await updateWithVersionCheck(db, "actors", "no-such-id", 0, { display_name: "X", },);
    expect(result.ok,).toBe(false,);
    expect(result.rowsAffected,).toBe(0,);
    expect(result.error,).toContain("Version conflict",);
  });

  it("increments the version across sequential updates", async () => {
    await insertActor(db, "a1",);
    expect((await updateWithVersionCheck(db, "actors", "a1", 0, { display_name: "v1", },)).ok,).toBe(true,);
    expect((await updateWithVersionCheck(db, "actors", "a1", 1, { display_name: "v2", },)).ok,).toBe(true,);
    const row = await db.selectFrom("actors",).select(["display_name", "format_version",],).where("id", "=", "a1",)
      .executeTakeFirst();

    expect(row?.display_name,).toBe("v2",);
    expect(row?.format_version,).toBe(2,);
  });

  it("overrides caller-supplied format_version and updated_at", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheck(db, "actors", "a1", 0, {
      display_name: "X",
      format_version: 99,
      updated_at: "1999-01-01T00:00:00.000Z",
    },);

    expect(result.ok,).toBe(true,);
    const row = await db.selectFrom("actors",).select(["format_version", "updated_at",],).where("id", "=", "a1",)
      .executeTakeFirst();

    expect(row?.format_version,).toBe(1,); // caller's 99 is ignored
    expect(row?.updated_at,).not.toBe("1999-01-01T00:00:00.000Z",); // bumped to now
  });

  it("stores null, numeric and unicode values verbatim", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheck(db, "actors", "a1", 0, {
      description: null,
      llm_assist_enabled: 1,
      avatar_focus_x: 2.5,
      display_name: "ünïcødé-✓",
    },);

    expect(result.ok,).toBe(true,);
    const row = await db.selectFrom("actors",).select([
      "description",
      "llm_assist_enabled",
      "avatar_focus_x",
      "display_name",
    ],).where("id", "=", "a1",).executeTakeFirst();

    expect(row,).toMatchObject({
      description: null,
      llm_assist_enabled: 1,
      avatar_focus_x: 2.5,
      display_name: "ünïcødé-✓",
    },);
  });

  it("treats a SQL-injection id as a literal value", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheck(db, "actors", "x' OR '1'='1", 0, { display_name: "pwned", },);
    expect(result.ok,).toBe(false,);
    expect(result.rowsAffected,).toBe(0,);
    const row = await db.selectFrom("actors",).select(["display_name",],).where("id", "=", "a1",).executeTakeFirst();
    expect(row?.display_name,).toBe("Original",);
  });

  it("stores a quote-laden value verbatim without breaking the table", async () => {
    await insertActor(db, "a1",);
    const evil = "'; DROP TABLE actors;--";
    const result = await updateWithVersionCheck(db, "actors", "a1", 0, { display_name: evil, },);
    expect(result.ok,).toBe(true,);
    const row = await db.selectFrom("actors",).select(["display_name",],).where("id", "=", "a1",).executeTakeFirst();
    expect(row?.display_name,).toBe(evil,);
  });
});

describe("updateWithVersionCheckRaw", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    ({ db, } = await createTestDb());
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  it("applies the update without touching updated_at", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheckRaw(db, "actors", "a1", 0, { display_name: "Raw", },);
    expect(result,).toEqual({ ok: true, rowsAffected: 1, },);
    const row = await db.selectFrom("actors",).select(["display_name", "format_version", "updated_at",],).where(
      "id",
      "=",
      "a1",
    ).executeTakeFirst();

    expect(row?.display_name,).toBe("Raw",);
    expect(row?.format_version,).toBe(1,);
    expect(row?.updated_at,).toBe(OLD_TIMESTAMP,);
  });

  it("preserves a caller-supplied updated_at", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheckRaw(db, "actors", "a1", 0, {
      display_name: "Raw",
      updated_at: "2021-06-01T00:00:00.000Z",
    },);

    expect(result.ok,).toBe(true,);
    const row = await db.selectFrom("actors",).select(["updated_at",],).where("id", "=", "a1",).executeTakeFirst();
    expect(row?.updated_at,).toBe("2021-06-01T00:00:00.000Z",);
  });

  it("rejects a stale version and leaves the row untouched", async () => {
    await insertActor(db, "a1",);
    const result = await updateWithVersionCheckRaw(db, "actors", "a1", 3, { display_name: "Stale", },);
    expect(result,).toEqual({
      ok: false,
      rowsAffected: 0,
      error: "Version conflict: record was modified by another process",
    },);

    const row = await db.selectFrom("actors",).select(["display_name", "format_version",],).where("id", "=", "a1",)
      .executeTakeFirst();

    expect(row?.display_name,).toBe("Original",);
    expect(row?.format_version,).toBe(0,);
  });
});

describe("getCurrentVersion", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    ({ db, } = await createTestDb());
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  it("returns the current format_version", async () => {
    await insertActor(db, "a1",);
    expect(await getCurrentVersion(db, "actors", "a1",),).toBe(0,);
    await updateWithVersionCheck(db, "actors", "a1", 0, { display_name: "v1", },);
    expect(await getCurrentVersion(db, "actors", "a1",),).toBe(1,);
  });

  it("returns null for a missing row", async () => {
    expect(await getCurrentVersion(db, "actors", "no-such-id",),).toBeNull();
  });
});
