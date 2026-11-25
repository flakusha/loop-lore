import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import type { DB, } from "./schema";
import { seedDefaultActors, } from "./seed";

const soloConfig = { auth: { required: false, }, } as Config;

describe("seedDefaultActors", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("creates Assistant actor and demo user on fresh DB", async () => {
    await seedDefaultActors(db, soloConfig,);

    const actor = await db
      .selectFrom("actors",)
      .selectAll()
      .where("id", "=", "assistant-default",)
      .executeTakeFirst();

    expect(actor,).toBeDefined();
    expect(actor?.display_name,).toBe("Assistant",);

    const user = await db.selectFrom("users",).selectAll().where("username", "=", "demo",).executeTakeFirst();
    expect(user,).toBeDefined();
    expect(user?.role,).toBe("solo",);
  });

  test("is idempotent on second run", async () => {
    await seedDefaultActors(db, soloConfig,);

    const actorCount = await db
      .selectFrom("actors",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();

    expect(actorCount?.n,).toBe(1,);

    const userCount = await db
      .selectFrom("users",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();

    expect(userCount?.n,).toBe(1,);
  });

  test("required auth seeds a real admin and never a Solo user", async () => {
    const fixture = await createTestDb();
    try {
      const requiredConfig = {
        auth: { required: true, adminUsername: "root", adminPassword: "sup3rsecret", },
      } as Config;

      await seedDefaultActors(fixture.db, requiredConfig,);

      const users = await fixture.db.selectFrom("users",).select(["username", "role",],).execute();
      expect(users.map((u,) => u.role),).not.toContain("solo",);
      expect(users.some((u,) => u.username === "root" && u.role === "admin"),).toBe(true,);
    } finally {
      await destroyTestDb(fixture,);
    }
  });
});
