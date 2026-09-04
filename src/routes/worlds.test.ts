/**
 * Unit tests for worlds routes (Elysia plugin)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { seedChatSetupTemplates, } from "../chat/service";
import { PublicationStatus, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import type { WorldBundle, } from "./export-shared";
import { importWorldBundle, } from "./world-import";
import { worldsRoutes, } from "./worlds";

const mockDb = {} as any;
const mockConfig = {} as any;

describe("worldsRoutes", () => {
  test("exports function", () => {
    expect(typeof worldsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = worldsRoutes({ database: mockDb, config: mockConfig, },);
    expect(plugin,).toBeDefined();
  });
});

describe("worlds creation publication_status (commit gating)", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedChatSetupTemplates(db,);
    userId = uid();

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    // Location auto-chat inserts userId as actor_id in chat_participants
    // (FK → actors.id) — user must have a matching actor row.
    await db
      .insertInto("actors",)
      .values({
        id: userId,
        actor_type: "user",
        display_name: "Test User",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /** Mount worlds routes behind a stub auth middleware that sets ctx.userId. */
  function authedApp(): Elysia {
    // Elysia derive type chaining is noisy in tests
    return new Elysia({ name: "test-worlds-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId, userRole: "user", }),)
      .use(worldsRoutes({ database: db, config: mockConfig, },),) as any;
  }

  test("created world defaults to draft", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Draft World", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = (await res.json()) as { id: string };

    const row = await db
      .selectFrom("worlds",)
      .select("publication_status",)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(row?.publication_status,).toBe(PublicationStatus.Draft,);
  });

  test("created location defaults to draft", async () => {
    const app = authedApp();

    const worldRes = await app.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "World for Loc", },),
      },),
    );
    const { id: worldId, } = (await worldRes.json()) as { id: string };

    const locRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Draft Location", },),
      },),
    );
    expect(locRes.status,).toBe(201,);
    const { id: locId, } = (await locRes.json()) as { id: string };

    const row = await db
      .selectFrom("locations",)
      .select("publication_status",)
      .where("id", "=", locId,)
      .executeTakeFirst();
    expect(row?.publication_status,).toBe(PublicationStatus.Draft,);
  });

  test("location creation auto-creates a public chat bound to the world template", async () => {
    const app = authedApp();

    const worldRes = await app.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "World for AutoChat", },),
      },),
    );
    const { id: worldId, } = (await worldRes.json()) as { id: string };

    const locRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Auto Chat Location", },),
      },),
    );
    expect(locRes.status,).toBe(201,);
    const { id: locId, } = (await locRes.json()) as { id: string };

    const chat = await db
      .selectFrom("chats",)
      .selectAll()
      .where("current_location_id", "=", locId,)
      .executeTakeFirst();
    expect(chat,).toBeDefined();
    expect(chat?.visibility,).toBe("public",);
    expect(chat?.template_id,).toBe("template-world",);
    expect(chat?.world_id,).toBe(worldId,);
    expect(chat?.name,).toBe("Auto Chat Location",);
  });

  test("location creation with explicit templateId binds a non-default template", async () => {
    const app = authedApp();

    const worldRes = await app.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "World for Custom Template", },),
      },),
    );
    const { id: worldId, } = (await worldRes.json()) as { id: string };

    const locRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "VN Location",
          templateId: "template-visual-novel",
          visibility: "private",
        },),
      },),
    );
    expect(locRes.status,).toBe(201,);
    const { id: locId, } = (await locRes.json()) as { id: string };

    const chat = await db
      .selectFrom("chats",)
      .selectAll()
      .where("current_location_id", "=", locId,)
      .executeTakeFirst();
    expect(chat,).toBeDefined();
    expect(chat?.template_id,).toBe("template-visual-novel",);
    expect(chat?.gm_config,).toBeTruthy();
    // Explicit fine-tune override wins over the template default.
    expect(chat?.visibility,).toBe("private",);
  });

  test("location creation rejects an unknown template", async () => {
    const app = authedApp();

    const worldRes = await app.handle(
      new Request("http://localhost/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "World for Bad Template", },),
      },),
    );
    const { id: worldId, } = (await worldRes.json()) as { id: string };

    const locRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Bad Template Location", templateId: "template-nope", },),
      },),
    );
    expect(locRes.status,).toBe(400,);
  });

  describe("world export/import round-trip", () => {
    test("GET /api/worlds/:id/export returns a round-trippable WorldBundle with locations", async () => {
      const app = authedApp();

      const worldRes = await app.handle(
        new Request("http://localhost/api/worlds", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Export Realm", description: "A realm to export", },),
        },),
      );
      const { id: worldId, } = (await worldRes.json()) as { id: string };
      expect(worldId,).toBeDefined();

      await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Keep", },),
        },),
      );

      const exportRes = await app.handle(
        new Request(`http://localhost/api/worlds/${worldId}/export`,),
      );
      expect(exportRes.status,).toBe(200,);
      expect(exportRes.headers.get("Content-Disposition",),).toContain("attachment",);
      expect(exportRes.headers.get("Content-Type",),).toContain("application/json",);

      const bundle = (await exportRes.json()) as {
        schema_version: string;
        world: { id: string; name: string; description: string | null };
        locations: { id: string; name: string }[];
      };
      expect(bundle.schema_version,).toBe("1.0",);
      expect(bundle.world.id,).toBe(worldId,);
      expect(bundle.world.name,).toBe("Export Realm",);
      expect(bundle.locations,).toHaveLength(1,);
      expect(bundle.locations[0]?.name,).toBe("Keep",);
    });

    test("exported bundle is accepted by the world importer", async () => {
      const app = authedApp();

      // Seed a source world with a location.
      const seedRes = await app.handle(
        new Request("http://localhost/api/worlds", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Source World", },),
        },),
      );
      const { id: sourceId, } = (await seedRes.json()) as { id: string };
      await app.handle(
        new Request(`http://localhost/api/worlds/${sourceId}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Source Village", },),
        },),
      );

      const exportRes = await app.handle(
        new Request(`http://localhost/api/worlds/${sourceId}/export`,),
      );
      expect(exportRes.status,).toBe(200,);
      const bundle = (await exportRes.json()) as WorldBundle;

      // Feed the exported bundle into the same importer the import route
      // uses, and confirm it round-trips as a NEW world.
      const { worldId: importedId, counts, } = await importWorldBundle(db, userId, bundle,);
      expect(importedId,).not.toBe(sourceId,);
      expect(counts.locations,).toBe(1,);

      const importedLocs = await db
        .selectFrom("locations",)
        .selectAll()
        .where("world_id", "=", importedId,)
        .execute();
      expect(importedLocs,).toHaveLength(1,);
      expect(importedLocs[0]?.name,).toBe("Source Village",);
    });

    test("export is owner-gated: non-owner gets forbidden", async () => {
      const app = authedApp();

      const worldRes = await app.handle(
        new Request("http://localhost/api/worlds", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ name: "Private Realm", },),
        },),
      );
      const { id: worldId, } = (await worldRes.json()) as { id: string };

      // Simulate a different user hitting the export endpoint.
      const otherApp = new Elysia({ name: "test-worlds-other", },)
        .derive({ as: "scoped", }, (_ctx,) => ({ userId: "other-user", userRole: "user", }),)
        .use(worldsRoutes({ database: db, config: mockConfig, },),) as any;

      const res = await otherApp.handle(
        new Request(`http://localhost/api/worlds/${worldId}/export`,),
      );
      expect(res.status,).toBe(403,);
    });
  });
});
