/**
 * Tests for character traits routes — permanent, world, and location trait CRUD.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertLocations, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { characterTraitsRoutes, } from "./character-traits";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OWNER_USER = "00000000-0000-4000-8000-000000000011";
const OTHER = "00000000-0000-4000-8000-000000000002";
const OTHER_USER = "00000000-0000-4000-8000-000000000012";
const WORLD = "00000000-0000-4000-8000-000000000101";
const LOCATION = "00000000-0000-4000-8000-000000000201";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  return new Elysia({ name: "test-traits", },)
    .derive(() => ({ userId, userRole, }))
    .use(characterTraitsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("characterTraitsRoutes", () => {
  test("exports function", () => {
    expect(typeof characterTraitsRoutes,).toBe("function",);
  });
});

describe("Permanent traits — owner", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Owner Actor", { id: OWNER as never, owner_id: OWNER_USER, user_id: OWNER_USER, },);
    await insertActors(db, "Other Actor", { id: OTHER as never, owner_id: OTHER_USER, user_id: OTHER_USER, },);
    await insertWorlds(db, OWNER_USER, "Test World", { id: WORLD as never, },);
    await insertLocations(db, WORLD, "Test Location", { id: LOCATION as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET traits returns 401 without auth", async () => {
    const app = makeApp(db,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/traits`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET traits returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/traits`,),);
    expect(res.status,).toBe(404,);
  });

  test("GET traits returns empty array for actor with no traits", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/traits`,),);
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("POST trait creates a permanent trait", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ trait_category: "personality", trait_name: "brave", value: "true", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    expect(id,).toBeDefined();
  });

  test("POST trait returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ trait_category: "personality", trait_name: "wise", value: "true", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("PUT trait updates a permanent trait", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/brave`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ value: "false", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("PUT trait returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/brave`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ value: "false", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE trait returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/brave`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });
});

describe("Permanent traits — admin/solo bypass", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owner Actor", { id: OWNER as never, owner_id: OWNER_USER, user_id: OWNER_USER, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("admin can GET another user's traits", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/traits`,),);
    expect(res.status,).toBe(200,);
  });

  test("solo can GET another user's traits", async () => {
    const app = makeApp(db, "solo", "solo",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/traits`,),);
    expect(res.status,).toBe(200,);
  });

  test("admin can POST trait on another user's actor", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ trait_category: "skill", trait_name: "swordsmanship", value: "expert", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });
});

describe("World traits", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owner Actor", { id: OWNER as never, owner_id: OWNER_USER, user_id: OWNER_USER, },);
    await insertWorlds(db, OWNER_USER, "Test World", { id: WORLD as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET world traits returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/world/${WORLD}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST world trait creates a world trait", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/world/${WORLD}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ trait_category: "reputation", trait_name: "hero", value: "loved", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("POST world trait returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/world/${WORLD}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ trait_category: "reputation", trait_name: "villain", value: "hated", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE world trait returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/world/${WORLD}/hero`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(404,);
  });
});

describe("Location traits", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owner Actor", { id: OWNER as never, owner_id: OWNER_USER, user_id: OWNER_USER, },);
    await insertWorlds(db, OWNER_USER, "Test World", { id: WORLD as never, },);
    await insertLocations(db, WORLD, "Test Location", { id: LOCATION as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET location traits returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/location/${LOCATION}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST location trait creates a location trait", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/location/${LOCATION}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ trait_category: "comfort", trait_name: "comfort", value: "high", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("POST location trait returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/location/${LOCATION}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ trait_category: "safety", trait_name: "danger", value: "low", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE location trait returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/traits/location/${LOCATION}/comfort`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(404,);
  });
});
