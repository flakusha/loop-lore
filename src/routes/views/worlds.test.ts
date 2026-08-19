/**
 * Tests for world view serving functions (list + detail content).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertChats,
  insertChatSetupTemplates,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { serveWorldDetail, } from "./view-serving";
import { serveWorldDetailContent, serveWorldsListDb, } from "./worlds";

describe("views/worlds", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "admin", "Admin", { id: "admin" as never, },);
    await insertUsers(db, "other", "Other", { id: "other" as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  describe("serveWorldsListDb", () => {
    test("returns empty state when no worlds exist", async () => {
      const res = await serveWorldsListDb(db, null, null,);
      const html = await res.text();
      expect(html,).toContain("No worlds found",);
    });

    test("non-admin user only sees their own worlds", async () => {
      await insertWorlds(db, "owner", "Mine", { id: "w-mine" as never, },);
      await insertWorlds(db, "other", "Theirs", { id: "w-theirs" as never, },);

      const html = await (await serveWorldsListDb(db, "owner", "user",)).text();
      expect(html,).toContain("world-card-w-mine",);
      expect(html,).not.toContain("world-card-w-theirs",);
    });

    test("admin sees all worlds sorted by name", async () => {
      const html = await (await serveWorldsListDb(db, "admin", "admin",)).text();
      expect(html,).toContain("world-card-w-mine",);
      expect(html,).toContain("world-card-w-theirs",);
      expect(html.indexOf("world-card-w-mine",),).toBeLessThan(html.indexOf("world-card-w-theirs",),);
    });

    test("escapes world name and description", async () => {
      await insertWorlds(db, "owner", "<b>X</b>", {
        id: "w-xss" as never,
        description: "<script>s</script>",
      },);
      const html = await (await serveWorldsListDb(db, "owner", "user",)).text();
      expect(html,).toContain("&lt;b&gt;X&lt;/b&gt;",);
      expect(html,).toContain("&lt;script&gt;s&lt;/script&gt;",);
    });
  });

  describe("serveWorldDetailContent", () => {
    test("returns world-not-found for missing world", async () => {
      const html = await (await serveWorldDetailContent("missing", db, "owner", "user",)).text();
      expect(html,).toContain("World not found",);
    });

    test("blocks non-owner non-admin users", async () => {
      const html = await (await serveWorldDetailContent("w-mine", db, "other", "user",)).text();
      expect(html,).toContain("World not found",);
    });

    test("renders detail with escaped fields and location list", async () => {
      await insertLocations(db, "w-mine", "Village", { id: "loc-1" as never, description: "quiet <&>", },);
      await insertChatSetupTemplates(db, "template-world", "World Template", { id: "template-world" as never, },);
      await insertChatSetupTemplates(db, "template-quest", "Quest Template", {
        id: "template-quest" as never,
        features: JSON.stringify(["combat", "loot",],),
      },);
      await insertChats(db, "Campaign", "owner", {
        id: "ch-1" as never,
        world_id: "w-mine",
        current_location_id: "loc-1",
        template_id: "template-world",
        visibility: "public" as never,
      },);

      const html = await (await serveWorldDetailContent("w-mine", db, "owner", "user",)).text();
      expect(html,).toContain("Village",);
      expect(html,).toContain("World Template",);
      expect(html,).toContain('"templateIsDefault":true',);
    });

    test("marks location with non-default template and includes features json", async () => {
      await insertLocations(db, "w-theirs", "Outpost", { id: "loc-2" as never, },);
      await insertChats(db, "Side", "owner", {
        id: "ch-2" as never,
        world_id: "w-theirs",
        current_location_id: "loc-2",
        template_id: "template-quest",
        visibility: "public" as never,
      },);

      const html = await (await serveWorldDetailContent("w-theirs", db, "admin", "admin",)).text();
      expect(html,).toContain('"templateName":"Quest Template"',);
      expect(html,).toContain('"templateIsDefault":false',);
      expect(html,).toContain("combat",);
      expect(html,).toContain("loot",);
    });
  });

  describe("serveWorldDetail (view-serving.ts substitution)", () => {
    test("substitutes EVERY {{worldId}} placeholder in the detail view", async () => {
      await insertWorlds(db, "owner", "Sub World", { id: "w-sub" as never, },);
      const res = await serveWorldDetail("w-sub", db, false, "owner", null, null,);
      expect(res,).not.toBeNull();
      const html = await res!.text();
      // The detail view references {{worldId}} in multiple places (refresh,
      // export, edit-modal, data-world-id, hx-get) — the single-occurrence
      // replace() used to leave the rest as literal placeholders. replaceAll
      // must substitute them all.
      expect(html,).not.toContain("{{worldId}}",);
      expect(html,).toContain("w-sub",);
    });
  });
});
