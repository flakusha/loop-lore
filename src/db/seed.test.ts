import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import { createLogger } from "../logger";
import { createTestDb } from "../test-utils/create-test-db";
import type { DB } from "./schema";
import { seedDefaultActors } from "./seed";

describe("seedDefaultActors", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn" });
    ({ db } = await createTestDb());
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("creates Assistant actor and demo user on fresh DB", async () => {
    await seedDefaultActors(db);

    const actor = await db
      .selectFrom("actors")
      .selectAll()
      .where("id", "=", "assistant-default")
      .executeTakeFirst();
    expect(actor).toBeDefined();
    expect(actor?.display_name).toBe("Assistant");

    const user = await db.selectFrom("users").selectAll().where("username", "=", "demo").executeTakeFirst();
    expect(user).toBeDefined();
    expect(user?.role).toBe("solo");
  });

  test("is idempotent on second run", async () => {
    await seedDefaultActors(db);

    const actorCount = await db
      .selectFrom("actors")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirst();
    expect(actorCount?.n).toBe(1);

    const userCount = await db
      .selectFrom("users")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirst();
    expect(userCount?.n).toBe(1);
  });
});
