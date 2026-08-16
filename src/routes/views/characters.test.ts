/**
 * Tests for character view serving functions (grid, edit form, chat list).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertAssets, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { serveCharacterChatListDb, serveCharacterEditForm, serveCharactersGrid, } from "./characters";

describe("views/characters", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  describe("serveCharactersGrid", () => {
    test("returns empty state when no characters exist", async () => {
      const res = await serveCharactersGrid(db,);
      const html = await res.text();
      expect(res.status,).toBe(200,);
      expect(html,).toContain("characters-empty",);
      expect(html,).toContain("No characters found",);
    });

    test("renders cards for non-user actors sorted by name", async () => {
      await insertUsers(db, "u-owner", "U Owner", { id: "u-owner" as never, },);
      await insertActors(db, "Zed", { id: "actor-zed" as never, actor_type: "character" as never, },);
      await insertActors(db, "Alice", {
        id: "actor-alice" as never,
        actor_type: "character" as never,
        description: "A desc",
      },);
      await insertActors(db, "Hidden", { id: "actor-hidden" as never, actor_type: "user" as never, },);

      const res = await serveCharactersGrid(db,);
      const html = await res.text();
      expect(html,).toContain("character-card-actor-zed",);
      expect(html,).toContain("character-card-actor-alice",);
      expect(html,).not.toContain("character-card-actor-hidden",);
      expect(html.indexOf("character-card-actor-alice",),).toBeLessThan(html.indexOf("character-card-actor-zed",),);
    });

    test("renders avatar img when avatar_asset_id set, placeholder otherwise", async () => {
      await insertAssets(db, "u-owner", "a.png", "image/png", "image", 10, "p", {
        id: "asset-1" as never,
      },);
      await insertActors(db, "Ava", {
        id: "actor-ava" as never,
        actor_type: "character" as never,
        avatar_asset_id: "asset-1",
      },);
      await insertActors(db, "Plain", { id: "actor-plain" as never, actor_type: "character" as never, },);

      const html = await (await serveCharactersGrid(db,)).text();
      expect(html,).toContain("/api/assets/asset-1/thumb",);
      expect(html,).toContain("<span>👤</span>",);
    });

    test("escapes display name and description", async () => {
      await insertActors(db, "<b>Evil</b>", {
        actor_type: "character" as never,
        description: "<script>x</script>",
      },);
      const html = await (await serveCharactersGrid(db,)).text();
      expect(html,).not.toContain("<b>Evil</b>",);
      expect(html,).toContain("&lt;b&gt;Evil&lt;/b&gt;",);
      expect(html,).toContain("&lt;script&gt;x&lt;/script&gt;",);
    });
  });

  describe("serveCharacterEditForm", () => {
    test("returns not-found state for missing character", async () => {
      const res = await serveCharacterEditForm("missing", db,);
      const html = await res.text();
      expect(html,).toContain("Character not found",);
    });

    test("renders edit form with escaped fields", async () => {
      const id = uid();
      await insertActors(db, "Hero", {
        id: id as never,
        actor_type: "character" as never,
        description: "desc <&>",
        personality: "calm",
        welcome_message: "hi",
        scenario: "s",
        mes_example: "m",
        post_history_instructions: "p",
      },);
      const html = await (await serveCharacterEditForm(id, db,)).text();
      expect(html,).toContain("Hero",);
      expect(html,).toContain("desc &lt;&amp;&gt;",);
      expect(html,).toContain("calm",);
      expect(html,).toContain("hi",);
    });

    test("includes avatar image and remove button when avatar set", async () => {
      const id = uid();
      await insertAssets(db, "u-owner", "pic.png", "image/png", "image", 100, "path", {
        id: "asset-9" as never,
      },);
      await insertActors(db, "Pict", {
        id: id as never,
        actor_type: "character" as never,
        avatar_asset_id: "asset-9",
      },);
      const html = await (await serveCharacterEditForm(id, db,)).text();
      expect(html,).toContain("/api/assets/asset-9/thumb",);
      expect(html,).toContain("Remove",);
    });
  });

  describe("serveCharacterChatListDb", () => {
    test("returns empty state when no chats match", async () => {
      const html = await (await serveCharacterChatListDb("nope", db,)).text();
      expect(html,).toContain("No chats yet",);
    });

    test("renders matching chat items and escapes names", async () => {
      await insertUsers(db, "u2", "U Two", { id: "u2" as never, },);
      await insertChats(db, "Adventure One", "u2", { id: "c1" as never, },);
      await insertChats(db, "<script>bad</script>", "u2", { id: "c2" as never, },);
      const html = await (await serveCharacterChatListDb("Adventure", db,)).text();
      expect(html,).toContain("chat-item-c1",);
      expect(html,).not.toContain("chat-item-c2",);
      expect(html,).toContain("/views/chat?chatid=c1",);
    });
  });
});
