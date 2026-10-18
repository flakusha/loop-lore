/**
 * Tests for character view serving functions (grid, edit form, chat list).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssets,
  insertCharacterArc,
  insertChats,
  insertGrowthLog,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { type ViewsViewer, } from "./access";
import {
  loadCharactersGridViewModel,
  serveCharacterChatListDb,
  serveCharacterEditForm,
  serveCharactersGrid,
} from "./characters";

/**
 * These tests exercise rendering, not access. `admin.character` sees every
 * character, so the seeded (unowned) rows still render; ownership scoping is
 * covered in the `ownership scoping` block below.
 */
const ADMIN: ViewsViewer = { userId: "admin-1", userRole: "admin", };

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
      const res = await serveCharactersGrid(db, ADMIN,);
      const html = await res.text();
      expect(res.status,).toBe(200,);
      expect(html,).toContain("characters-empty",);
      expect(html,).toContain("No characters found",);
    });

    test("loadCharactersGridViewModel returns the same rows the fragment renders", async () => {
      const viewModel = await loadCharactersGridViewModel(db, ADMIN,);
      const html = await (await serveCharactersGrid(db, ADMIN,)).text();

      expect(viewModel.characters,).toEqual([],);
      expect(html,).toContain("characters-empty",);

      await insertActors(db, "Grid Actor", {
        id: "actor-grid" as never,
        actor_type: "character" as never,
        description: "Grid desc",
        review_state: "approved",
      },);

      const populated = await loadCharactersGridViewModel(db, ADMIN,);
      const populatedHtml = await (await serveCharactersGrid(db, ADMIN,)).text();

      expect(populated.characters.length,).toBe(1,);
      const [only,] = populated.characters;
      expect(only?.id,).toBe("actor-grid",);
      expect(only?.displayName,).toBe("Grid Actor",);
      expect(only?.description,).toBe("Grid desc",);
      expect(only?.reviewState,).toBe("approved",);
      expect(only?.avatarUrl,).toBeNull();
      expect(populatedHtml,).toContain('data-testid="character-card-actor-grid"',);
      expect(populatedHtml,).toContain(only?.displayName ?? "",);
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

      const res = await serveCharactersGrid(db, ADMIN,);
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

      const html = await (await serveCharactersGrid(db, ADMIN,)).text();
      expect(html,).toContain("/api/v1/assets/asset-1/thumb",);
      expect(html,).toContain("<span>👤</span>",);
    });

    test("escapes display name and description", async () => {
      await insertActors(db, "<b>Evil</b>", {
        actor_type: "character" as never,
        description: "<script>x</script>",
      },);

      const html = await (await serveCharactersGrid(db, ADMIN,)).text();
      expect(html,).not.toContain("<b>Evil</b>",);
      expect(html,).toContain("&lt;b&gt;Evil&lt;/b&gt;",);
      expect(html,).toContain("&lt;script&gt;x&lt;/script&gt;",);
    });
  });

  describe("serveCharacterEditForm", () => {
    test("returns not-found state for missing character", async () => {
      const res = await serveCharacterEditForm("missing", db, ADMIN,);
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

      const html = await (await serveCharacterEditForm(id, db, ADMIN,)).text();
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

      const html = await (await serveCharacterEditForm(id, db, ADMIN,)).text();
      expect(html,).toContain("/api/v1/assets/asset-9/thumb",);
      expect(html,).toContain("Remove",);
    });

    test("seeds growth section from actors row + character_arc", async () => {
      const id = uid();
      await insertActors(db, "Growing", {
        id: id as never,
        actor_type: "character" as never,
        growth_mode: "static",
        llm_assist_enabled: 1,
      },);

      await insertCharacterArc(db, id, "crisis", new Date().toISOString(), {
        stage_description: "The fall",
      },);

      await insertGrowthLog(db, id, "trait", "trait_drifted", new Date().toISOString(), {
        status: "applied",
        reason: "Faced the fall",
      },);

      await insertGrowthLog(db, id, "skill", "skill_acquired", new Date().toISOString(), {
        status: "pending",
        reason: "Not yet confirmed",
      },);

      const html = await (await serveCharacterEditForm(id, db, ADMIN,)).text();
      expect(html,).toContain("character-growth-section",);
      expect(html,).toContain("initialMode: 'static'",);
      expect(html,).toContain("initialLlmAssist: true",);
      expect(html,).toContain('<option value="crisis" selected>',);
      expect(html,).toContain("The fall",);
      // Only applied entries seed the section; pending proposals stay hidden.
      expect(html,).toContain("Faced the fall",);
      expect(html,).not.toContain("Not yet confirmed",);
    });
  });

  describe("serveCharacterChatListDb", () => {
    test("returns empty state when no chats match", async () => {
      const html = await (await serveCharacterChatListDb("nope", db, ADMIN,)).text();
      expect(html,).toContain("No chats yet",);
    });

    test("renders matching chat items and escapes names", async () => {
      await insertUsers(db, "u2", "U Two", { id: "u2" as never, },);
      await insertChats(db, "Adventure One", "u2", { id: "c1" as never, },);
      await insertChats(db, "<script>bad</script>", "u2", { id: "c2" as never, },);
      const html = await (await serveCharacterChatListDb("Adventure", db, ADMIN,)).text();
      expect(html,).toContain("chat-item-c1",);
      expect(html,).not.toContain("chat-item-c2",);
      expect(html,).toContain("/views/chat?chatid=c1",);
    });
  });

  /**
   * The edit form renders `system_prompt`, `scenario` and friends, so a
   * character id from the path must be gated on `actors.owner_id` before the
   * row is read — and the denial must be indistinguishable from a miss.
   */
  describe("ownership scoping", () => {
    const OWNER: ViewsViewer = { userId: "u-scope-owner", userRole: "user", };
    const STRANGER: ViewsViewer = { userId: "u-scope-stranger", userRole: "user", };

    test("the grid lists only the viewer's own characters", async () => {
      await insertUsers(db, "u-scope-owner", "Scope Owner", { id: "u-scope-owner" as never, },);
      await insertUsers(db, "u-scope-stranger", "Scope Stranger", { id: "u-scope-stranger" as never, },);
      await insertActors(db, "Mine", {
        id: "actor-scope-mine" as never,
        actor_type: "character" as never,
        owner_id: "u-scope-owner" as never,
      },);

      await insertActors(db, "Theirs", {
        id: "actor-scope-theirs" as never,
        actor_type: "character" as never,
        owner_id: "u-scope-stranger" as never,
      },);

      const mine = await loadCharactersGridViewModel(db, OWNER,);
      expect(mine.characters.map((c,) => c.id),).toContain("actor-scope-mine",);
      expect(mine.characters.map((c,) => c.id),).not.toContain("actor-scope-theirs",);

      const theirs = await loadCharactersGridViewModel(db, STRANGER,);
      expect(theirs.characters.map((c,) => c.id),).toContain("actor-scope-theirs",);
      expect(theirs.characters.map((c,) => c.id),).not.toContain("actor-scope-mine",);
    });

    test("the edit form renders for the owner and refuses everyone else", async () => {
      const html = await (await serveCharacterEditForm("actor-scope-mine", db, OWNER,)).text();
      expect(html,).toContain("character-edit-form",);

      const denied = await (await serveCharacterEditForm("actor-scope-mine", db, STRANGER,)).text();
      expect(denied,).toContain("Character not found",);
      expect(denied,).not.toContain("character-edit-form",);
    });

    test("the character chat-list is scoped to the viewer's chats", async () => {
      await insertChats(db, "Scope Adventure", "u-scope-owner", { id: "chat-scope" as never, },);

      const owned = await (await serveCharacterChatListDb("Scope Adventure", db, OWNER,)).text();
      expect(owned,).toContain("chat-item-chat-scope",);

      const denied = await (await serveCharacterChatListDb("Scope Adventure", db, STRANGER,)).text();
      expect(denied,).not.toContain("chat-item-chat-scope",);
      expect(denied,).toContain("No chats yet",);
    });
  });
});
