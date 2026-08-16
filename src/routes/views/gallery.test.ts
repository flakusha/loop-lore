/**
 * Tests for views/gallery serve functions (formatSize, serveGalleryGrid).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { formatSize, serveGalleryGrid, } from "./gallery";

describe("views/gallery — formatSize", () => {
  test("bytes", () => {
    expect(formatSize(512,),).toBe("512 B",);
  });

  test("kilobytes", () => {
    expect(formatSize(2048,),).toBe("2.0 KB",);
  });

  test("megabytes", () => {
    expect(formatSize(3_145_728,),).toBe("3.0 MB",);
  });
});

describe("views/gallery — serveGalleryGrid", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertAssets(db, "owner", "a.png", "image/png", "image", 2048, "p/a", { id: "g1" as never, },);
    await insertAssets(db, "owner", "b.mp3", "audio/mpeg", "audio", 2048, "p/b", { id: "g2" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("empty grid renders empty state", async () => {
    const res = await serveGalleryGrid(db,);
    const html = await res.text();
    expect(html,).not.toContain("gallery-empty",);
    expect(html,).toContain("asset-card-g1",);
    expect(html,).toContain("asset-card-g2",);
  });

  test("entity filter narrows to linked assets", async () => {
    await db
      .insertInto("asset_links",)
      .values([
        { asset_id: "g1", entity_type: "character", entity_id: "char-1", },
        { asset_id: "g2", entity_type: "character", entity_id: "char-1", },
        { asset_id: "g1", entity_type: "character", entity_id: "char-2", },
      ],)
      .execute();

    const res = await serveGalleryGrid(
      db,
      new URLSearchParams({ entityType: "character", entityId: "char-1", },),
    );
    const html = await res.text();
    expect(html,).toContain("asset-card-g1",);
    expect(html,).toContain("asset-card-g2",);
    expect(html,).not.toContain("asset-card-g3",);
  });

  test("renders image thumbs and audio icons", async () => {
    const res = await serveGalleryGrid(db,);
    const html = await res.text();
    expect(html,).toContain("/api/assets/g1/thumb",);
    expect(html,).toContain("🎵",);
  });
});
