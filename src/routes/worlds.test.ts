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
    expect(chat?.visual_novel,).toBe(1,);
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
});
