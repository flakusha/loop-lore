// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for views/gallery serve functions (formatSize, serveGalleryGrid) and
 * the G7 tag facets wired into the grid (data-tags attribute + tag param).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { renameAssetTag, } from "../../assets/service/tags";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertAssetTags, insertUsers, } from "../../test-utils/insert-helpers";
import { formatSize, inheritedHiddenAssetIds, serveGalleryGrid, } from "./gallery";

describe("views/gallery", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("bytes", () => {
    expect(formatSize(512,),).toBe("512 B",);
    expect(formatSize(10,),).toBe("10 B",);
    expect(formatSize(7,),).toBe("7 B",);
  });
  test("kilobytes", () => {
    expect(formatSize(2048,),).toBe("2.0 KB",);
    expect(formatSize(2048,),).toBe("2.0 KB",);
  });
  test("megabytes", () => {
    expect(formatSize(3_145_728,),).toBe("3.0 MB",);
  });

  test("anonymous cannot see private user's avatar", async () => {
    const res = await serveGalleryGrid(db, undefined, undefined, undefined,);
    const html = await res.text();
    expect(html,).not.toContain("asset-card-asset-1",);
  });

  test("public character's avatar visible to other users", async () => {
    await insertAssets(db, "owner", "a-pix.png", "image/png", "image", 2048, "path/a", {
      id: "asset-1" as never,
      visibility: "public" as never,
    },);
    const res = await serveGalleryGrid(db, undefined, "bob", "user",);
    const html = await res.text();
    expect(html,).toContain("asset-card-asset-1",);
  });

  test("admin sees private character's avatar", async () => {
    await insertUsers(db, "bob", "Bob", { id: "bob" as never, },);
    await insertAssets(db, "owner", "b-pix.png", "image/png", "image", 2048, "path/b", {
      id: "asset-2" as never,
    },);
    const res = await serveGalleryGrid(db, undefined, "bob", "admin",);
    const html = await res.text();
    expect(html,).toContain("asset-card-asset-2",);
  });

  test("inheritedHiddenAssetIds inherits hidden asset ids", async () => {
    const hidden = await inheritedHiddenAssetIds(db, ["asset-1", "asset-2",], null, null,);
    expect(hidden.size,).toBe(0,);
  });
});

describe("views/gallery — tag facets", () => {
  let db2: Kysely<DB>;
  let sqlite2: Database;

  beforeAll(async () => {
    ({ db: db2, sqlite: sqlite2, } = await createTestDb());
    await insertUsers(db2, "towner", "Tag Owner", { id: "towner" as never, },);
    await insertUsers(db2, "tmallory", "Tag Mallory", { id: "tmallory" as never, },);
    await insertUsers(db2, "tspectator", "Tag Spectator", { id: "tspectator" as never, },);
    await insertAssets(db2, "towner", "pub.png", "image/png", "image", 8, "p/pub", {
      id: "pg1" as never,
      visibility: "public" as never,
    },);
    await insertAssets(db2, "towner", "mine.png", "image/png", "image", 8, "p/mine", { id: "tg2" as never, },);
    await insertAssetTags(db2, "pg1", "cozy", { scope: "global", },);
    await insertAssetTags(db2, "pg1", "mine", { scope: "user", owner_id: "towner", },);
    await insertAssetTags(db2, "pg1", "foreign", { scope: "user", owner_id: "tspectator", },);
  },);

  afterAll(() => sqlite2.close());

  test("cards expose only the viewer's visible tags", async () => {
    const res = await serveGalleryGrid(db2, undefined, "towner", "user",);
    const html = await res.text();
    expect(html,).toContain('data-tags="cozy,mine"',);
    expect(html,).not.toContain("foreign",);
  });

  test("other users see only the global tags of a public asset", async () => {
    const res = await serveGalleryGrid(db2, undefined, "tmallory", "user",);
    const html = await res.text();
    expect(html,).toContain("asset-card-pg1",);
    expect(html,).toContain('data-tags="cozy"',);
    expect(html,).not.toContain('data-tags="cozy,mine"',);
  });

  test("tag param narrows to tagged assets", async () => {
    const res = await serveGalleryGrid(db2, new URLSearchParams({ tag: "cozy", },), "towner", "user",);
    const html = await res.text();
    expect(html,).toContain("asset-card-pg1",);
    expect(html,).not.toContain("asset-card-tg2",);
  });

  test("viewer's own user tag matches the facet", async () => {
    const res = await serveGalleryGrid(db2, new URLSearchParams({ tag: "mine", },), "towner", "user",);
    const html = await res.text();
    expect(html,).toContain("asset-card-pg1",);
  });

  test("other users' user tag never matches the facet", async () => {
    const res = await serveGalleryGrid(db2, new URLSearchParams({ tag: "foreign", },), "towner", "user",);
    const html = await res.text();
    expect(html,).toContain("gallery-empty",);
  });

  test("tag with no matches renders empty state", async () => {
    const res = await serveGalleryGrid(db2, new URLSearchParams({ tag: "missing-tag", },), "towner", "user",);
    const html = await res.text();
    expect(html,).toContain("gallery-empty",);
  });

  test("tag rename propagates to grid facets", async () => {
    await renameAssetTag({
      database: db2,
      assetId: "pg1",
      oldTag: "cozy",
      newTag: "homely",
      scope: "global",
      ownerId: null,
    },);
    const stale = await serveGalleryGrid(db2, new URLSearchParams({ tag: "cozy", },), "towner", "user",);
    expect(await stale.text(),).toContain("gallery-empty",);
    const fresh = await serveGalleryGrid(db2, new URLSearchParams({ tag: "homely", },), "towner", "user",);
    expect(await fresh.text(),).toContain("asset-card-pg1",);
    const grid = await serveGalleryGrid(db2, undefined, "towner", "user",);
    expect(await grid.text(),).toContain("homely",);
  });
});
