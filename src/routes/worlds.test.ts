/**
 * Unit tests for worlds routes (Elysia plugin)
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
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
});
