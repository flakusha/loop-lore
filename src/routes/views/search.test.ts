/**
 * Tests for views/search serve functions (gallery / characters / worlds).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertAssets, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { serveCharactersSearch, serveGallerySearch, serveWorldsSearch, } from "./search";

describe("views/search — gallery", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertAssets(db, "owner", "sword.png", "image/png", "image", 2048, "path/a", { id: "asset-1" as never, },);
    await insertAssets(db, "owner", "theme.mp3", "audio/mpeg", "audio", 3_000_000, "path/b", {
      id: "asset-2" as never,
    },);
    await insertAssets(db, "owner", "intro.mp4", "video/mp4", "video", 10_000_000, "path/c", {
      id: "asset-3" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  test("empty query returns all assets sorted by filename", async () => {
    const res = await serveGallerySearch(db, new URLSearchParams(),);
    const html = await res.text();
    expect(html,).toContain('data-testid="asset-card-asset-1"',);
    expect(html,).toContain('data-testid="asset-card-asset-2"',);
    expect(html,).toContain('data-testid="asset-card-asset-3"',);
  });

  test("query filters by filename", async () => {
    const res = await serveGallerySearch(db, new URLSearchParams({ q: "sword", },),);
    const html = await res.text();
    expect(html,).toContain("asset-card-asset-1",);
    expect(html,).not.toContain("asset-card-asset-2",);
  });

  test("type filter narrows asset type", async () => {
    const res = await serveGallerySearch(db, new URLSearchParams({ type: "audio", },),);
    const html = await res.text();
    expect(html,).toContain("asset-card-asset-2",);
    expect(html,).not.toContain("asset-card-asset-1",);
  });

  test("no matches renders empty state", async () => {
    const res = await serveGallerySearch(db, new URLSearchParams({ q: "zzz-nothing", },),);
    const html = await res.text();
    expect(html,).toContain("gallery-empty",);
  });

  test("renders per-type thumbnails", async () => {
    const res = await serveGallerySearch(db, new URLSearchParams(),);
    const html = await res.text();
    expect(html,).toContain("/api/assets/asset-1/thumb",); // image
    expect(html,).toContain("🎵",); // audio
    expect(html,).toContain("🎬",); // video
  });

  test("escapes filenames", async () => {
    await db
      .insertInto("assets",)
      .values({
        id: "asset-x",
        owner_id: "owner",
        filename: "<script>alert(1)</script>.png",
        mime_type: "image/png",
        asset_type: "image",
        size_bytes: 10,
        storage_path: "p",
        created_at: new Date().toISOString(),
      },)
      .execute();
    const res = await serveGallerySearch(db, new URLSearchParams({ q: "script", },),);
    const html = await res.text();
    expect(html,).not.toContain("<script>alert(1)</script>",);
    expect(html,).toContain("&lt;script&gt;",);
  });
});

describe("views/search — characters", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertActors(db, "Zed", {
      id: "actor-zed" as never,
      owner_id: "owner",
      actor_type: "character" as never,
      description: "grumpy",
    },);
    await insertActors(db, "Aria", {
      id: "actor-aria" as never,
      owner_id: "owner",
      actor_type: "character" as never,
    },);
    await insertActors(db, "User One", {
      id: "owner" as never,
      owner_id: "owner",
      actor_type: "user" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  test("lists non-user actors sorted by name", async () => {
    const res = await serveCharactersSearch(db, new URLSearchParams(),);
    const html = await res.text();
    expect(html,).toContain('data-testid="character-card-actor-aria"',);
    expect(html,).toContain('data-testid="character-card-actor-zed"',);
    expect(html.indexOf("actor-aria",),).toBeLessThan(html.indexOf("actor-zed",),);
    expect(html,).not.toContain("character-card-owner",); // user actor excluded
  });

  test("query filters by display_name", async () => {
    const res = await serveCharactersSearch(db, new URLSearchParams({ q: "aria", },),);
    const html = await res.text();
    expect(html,).toContain("actor-aria",);
    expect(html,).not.toContain("actor-zed",);
  });

  test("no matches renders empty state", async () => {
    const res = await serveCharactersSearch(db, new URLSearchParams({ q: "nobody-here", },),);
    const html = await res.text();
    expect(html,).toContain("characters-empty",);
  });

  test("renders placeholder avatar when no asset", async () => {
    const res = await serveCharactersSearch(db, new URLSearchParams(),);
    const html = await res.text();
    expect(html,).toContain("<span>👤</span>",);
  });

  test("escapes character names and descriptions", async () => {
    await db
      .insertInto("actors",)
      .values({
        id: "actor-bad",
        display_name: "<b>X</b>",
        actor_type: "character",
        agent_type: "ai" as never,
        description: "evil <i>guy</i>",
        owner_id: "owner",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();
    const res = await serveCharactersSearch(db, new URLSearchParams({ q: "X", },),);
    const html = await res.text();
    expect(html,).not.toContain("<b>X</b>",);
    expect(html,).not.toContain("<i>guy</i>",);
  });
});

describe("views/search — worlds", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "alice", "Alice", { id: "alice" as never, },);
    await insertUsers(db, "bob", "Bob", { id: "bob" as never, },);
    await insertWorlds(db, "alice", "Elm", { id: "world-elm" as never, description: "forest", },);
    await insertWorlds(db, "alice", "Ash", { id: "world-ash" as never, },);
    await insertWorlds(db, "bob", "Bog", { id: "world-bog" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("admin sees all worlds", async () => {
    const res = await serveWorldsSearch(db, new URLSearchParams(), "alice", "admin",);
    const html = await res.text();
    expect(html,).toContain("world-card-world-elm",);
    expect(html,).toContain("world-card-world-bog",);
  });

  test("non-admin sees only own worlds", async () => {
    const res = await serveWorldsSearch(db, new URLSearchParams(), "alice", "user",);
    const html = await res.text();
    expect(html,).toContain("world-card-world-elm",);
    expect(html,).not.toContain("world-card-world-bog",);
  });

  test("query filters by name", async () => {
    const res = await serveWorldsSearch(db, new URLSearchParams({ q: "ash", },), "alice", "user",);
    const html = await res.text();
    expect(html,).toContain("world-card-world-ash",);
    expect(html,).not.toContain("world-card-world-elm",);
  });

  test("no matches renders empty state", async () => {
    const res = await serveWorldsSearch(db, new URLSearchParams({ q: "void", },), "alice", "user",);
    const html = await res.text();
    expect(html,).toContain("No worlds match your search",);
  });

  test("escapes world names", async () => {
    await db
      .insertInto("worlds",)
      .values({
        id: "world-bad",
        owner_id: "alice",
        name: "<script>w</script>",
        description: null,
        lore: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();
    const res = await serveWorldsSearch(db, new URLSearchParams({ q: "script", },), "alice", "user",);
    const html = await res.text();
    expect(html,).not.toContain("<script>w</script>",);
  });
});
