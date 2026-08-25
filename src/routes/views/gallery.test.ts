/**
 * Tests for views/gallery serve functions (formatSize, serveGalleryGrid).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertAssetLinks, insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
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

  test("owner sees their assets in the grid", async () => {
    const res = await serveGalleryGrid(db, undefined, "owner", "user",);
    const html = await res.text();
    expect(html,).not.toContain("gallery-empty",);
    expect(html,).toContain("asset-card-g1",);
    expect(html,).toContain("asset-card-g2",);
  });

  test("anonymous viewers see no private assets in the grid", async () => {
    const res = await serveGalleryGrid(db, undefined, null, null,);
    const html = await res.text();
    expect(html,).toContain("gallery-empty",);
    expect(html,).not.toContain("asset-card-g1",);
  });

  test("other users do not see private assets in the grid", async () => {
    await insertUsers(db, "mallory", "Mallory", { id: "mallory" as never, },);
    const res = await serveGalleryGrid(db, undefined, "mallory", "user",);
    const html = await res.text();
    expect(html,).not.toContain("asset-card-g1",);
    expect(html,).not.toContain("asset-card-g2",);
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
      "owner",
      "user",
    );
    const html = await res.text();
    expect(html,).toContain("asset-card-g1",);
    expect(html,).toContain("asset-card-g2",);
    expect(html,).not.toContain("asset-card-g3",);
  });

  test("invalid entity filter renders an error card", async () => {
    const res = await serveGalleryGrid(
      db,
      new URLSearchParams({ entityType: "bogus", entityId: "x", },),
      "owner",
      "user",
    );
    const html = await res.text();
    expect(html,).toContain("Invalid entity type",);
  });

  test("renders image thumbs and audio icons", async () => {
    const res = await serveGalleryGrid(db, undefined, "owner", "user",);
    const html = await res.text();
    expect(html,).toContain("/api/assets/g1/thumb",);
    expect(html,).toContain("🎵",);
  });
});

describe("views/gallery — visibility inheritance (G6)", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "alice" as never, },);
    await insertUsers(db, "bob", "Bob", { id: "bob" as never, },);

    // alice's private character with a linked avatar asset
    await insertActors(db, "Private Pix", {
      id: "actor-pix" as never,
      owner_id: "alice",
      actor_type: "character" as never,
      visibility: "private" as never,
    },);
    // alice's public character with a linked avatar asset
    await insertActors(db, "Public Pug", {
      id: "actor-pug" as never,
      owner_id: "alice",
      actor_type: "character" as never,
      visibility: "public" as never,
    },);

    await insertAssets(db, "alice", "pix.png", "image/png", "image", 2048, "p/pix", {
      id: "a-pix" as never,
    },);
    await insertAssets(db, "alice", "pug.png", "image/png", "image", 2048, "p/pug", {
      id: "a-pug" as never,
    },);
    await insertAssetLinks(db, "a-pix", "actor", "actor-pix",);
    await insertAssetLinks(db, "a-pug", "actor", "actor-pug",);
  },);

  afterAll(() => sqlite.close());

  test("owner sees their private character's avatar", async () => {
    const res = await serveGalleryGrid(db, undefined, "alice", "user",);
    const html = await res.text();
    expect(html,).toContain("asset-card-a-pix",);
  });

  test("other user does not see private character's avatar", async () => {
    const res = await serveGalleryGrid(db, undefined, "bob", "user",);
    const html = await res.text();
    expect(html,).not.toContain("asset-card-a-pix",);
  });

  test("anonymous cannot see private character's avatar", async () => {
    const res = await serveGalleryGrid(db, undefined, null, null,);
    const html = await res.text();
    expect(html,).not.toContain("asset-card-a-pix",);
  });

  test("public character's avatar visible to other users", async () => {
    const res = await serveGalleryGrid(db, undefined, "bob", "user",);
    const html = await res.text();
    expect(html,).toContain("asset-card-a-pug",);
  });

  test("admin sees private character's avatar", async () => {
    const res = await serveGalleryGrid(db, undefined, "bob", "admin",);
    const html = await res.text();
    expect(html,).toContain("asset-card-a-pix",);
  });
});
