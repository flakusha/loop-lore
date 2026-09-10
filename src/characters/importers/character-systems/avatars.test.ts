// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * importAvatars tests — the importer loops over `data.avatars`, creating
 * one `character_avatars` row per entry (via AvatarService.createAvatar,
 * which also links the underlying asset to the actor for gallery
 * visibility), then upserts the avatar-config blob when present.
 *
 * Coverage pins:
 *   - no-op when data is undefined
 *   - one avatar inserted → result.avatarsImported === 1
 *   - avatar-creation failure pushes an error message and keeps going
 *     (the surrounding importer continues to the next avatar)
 *   - config upsert is invoked when data.config is set
 *   - config upsert failure is captured, not thrown
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertUsers, } from "../../../test-utils/insert-helpers";
import { importAvatars, } from "./avatars";
import type { CharacterSystemsImportResult, } from "./types";

async function insertAsset(
  db: Kysely<DB>,
  userId: string,
  filename: string,
  mimeType: string,
  storagePath: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insertInto("assets",).values({
    id,
    owner_id: userId,
    filename,
    mime_type: mimeType,
    asset_type: "image",
    size_bytes: 1024,
    storage_path: storagePath,
  },).execute();
  return id;
}

describe("importAvatars", () => {
  let db: Kysely<DB>;
  let userId: string;
  let actorId: string;
  let otherActorId: string;
  let assetA: string;
  let assetB: string;

  function emptyResult(): CharacterSystemsImportResult {
    return {
      traitsImported: 0,
      moodImported: false,
      relationshipsImported: 0,
      avatarsImported: 0,
      licensingImported: false,
      availabilityImported: false,
      worldSetupImported: false,
      errors: [],
    };
  }

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertUsers(db, "gm", "GM",);
    const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
    userId = user.id;

    await db.insertInto("actors",).values({
      id: crypto.randomUUID(),
      display_name: "Test-Avatars-1",
    },).execute();
    await db.insertInto("actors",).values({
      id: crypto.randomUUID(),
      display_name: "Test-Avatars-2",
    },).execute();
    const rows = await db.selectFrom("actors",).select(["id",],)
      .where("display_name", "in", ["Test-Avatars-1", "Test-Avatars-2",],)
      .orderBy("display_name",).execute();
    actorId = rows[0]!.id;
    otherActorId = rows[1]!.id;

    // Real assets so the FK on character_avatars.asset_id resolves.
    assetA = await insertAsset(db, userId, "avatar-a.png", "image/png", "/tmp/avatar-a.png",);
    assetB = await insertAsset(db, userId, "avatar-b.png", "image/png", "/tmp/avatar-b.png",);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns early when data is undefined", async () => {
    const result = emptyResult();
    await importAvatars(db, actorId, undefined, result,);
    expect(result.avatarsImported,).toBe(0,);
    expect(result.errors,).toEqual([],);
  });

  test("creates one character_avatars row per supplied avatar", async () => {
    const result = emptyResult();
    await importAvatars(db, actorId, {
      avatars: [
        { assetId: assetA, label: "primary", tags: {}, isPrimary: true, sortOrder: 1, },
        { assetId: assetB, label: "secondary", tags: {}, isPrimary: false, sortOrder: 2, },
      ],
    }, result,);

    expect(result.avatarsImported,).toBe(2,);
    expect(result.errors,).toEqual([],);
    const rows = await db.selectFrom("character_avatars",).selectAll()
      .where("actor_id", "=", actorId,).orderBy("sort_order",).execute();
    expect(rows.length,).toBe(2,);
    expect(rows[0]!.label,).toBe("primary",);
    expect(rows[0]!.is_primary,).toBe(1,);
    expect(rows[1]!.label,).toBe("secondary",);
    expect(rows[1]!.is_primary,).toBe(0,);
  });

  test("continues iterating after a per-avatar failure", async () => {
    // Point the first avatar at a non-existent asset → createAvatar will
    // fail (FK violation when linking). The second avatar should still be
    // imported.
    const result = emptyResult();
    await importAvatars(db, otherActorId, {
      avatars: [
        { assetId: "asset-does-not-exist", label: "broken", tags: {}, isPrimary: false, sortOrder: 1, },
        { assetId: assetA, label: "ok", tags: {}, isPrimary: false, sortOrder: 2, },
      ],
    }, result,);

    expect(result.avatarsImported,).toBe(1,);
    expect(result.errors.length,).toBe(1,);
    expect(result.errors[0]!,).toContain('Failed to import avatar "broken":',);

    const rows = await db.selectFrom("character_avatars",).selectAll()
      .where("actor_id", "=", otherActorId,).execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.label,).toBe("ok",);
  });

  test("upserts avatar config when data.config is provided", async () => {
    const result = emptyResult();
    await importAvatars(db, actorId, {
      avatars: [],
      config: {
        selectionRule: "weighted_random",
        weights: { happy: 0.6, sad: 0.4, },
        fallbackChain: ["happy", "sad",],
      },
    }, result,);
    expect(result.errors,).toEqual([],);

    const cfg = await db.selectFrom("character_avatar_config",).selectAll()
      .where("actor_id", "=", actorId,).executeTakeFirst();
    expect(cfg,).toBeDefined();
    expect(cfg!.selection_rule,).toBe("weighted_random",);
  });

  test("captures config upsert errors without throwing", async () => {
    const result = emptyResult();
    // Drop the config table to force an upsert failure.
    await db.schema.dropTable("character_avatar_config",).execute();
    await importAvatars(db, actorId, {
      avatars: [],
      config: { selectionRule: "round_robin", weights: {}, fallbackChain: [], },
    }, result,);
    expect(result.errors.length,).toBe(1,);
    expect(result.errors[0]!,).toContain("Failed to import avatar config:",);
    // Recreate for the rest of the suite.
    await db.schema.createTable("character_avatar_config",).addColumn("id", "text", (c,) => c.primaryKey(),)
      .addColumn("actor_id", "text", (c,) => c.notNull(),)
      .addColumn("selection_rule", "text", (c,) => c.notNull(),)
      .addColumn("weights", "text",)
      .addColumn("fallback_chain", "text",)
      .addColumn("created_at", "text", (c,) => c.notNull(),)
      .addColumn("updated_at", "text", (c,) => c.notNull(),)
      .execute();
  });
});
