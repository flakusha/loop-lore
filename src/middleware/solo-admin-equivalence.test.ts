import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { AuthConfig } from "../config/schema";
import type { DB } from "../db/schema";
import { seedDefaultActors } from "../db/seed";
import { authenticate, resetSoloUserCache } from "../middleware/auth";
import { createTestDb } from "../test-utils/create-test-db";

const soloAuthConfig = {
  required: false,
  registrationOpen: true,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 10,
  demoUsername: "demo",
  demoAutoSetup: true,
} as unknown as AuthConfig;

describe("verify seeding of admin (solo/demo mode)", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db } = await createTestDb());
    await seedDefaultActors(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("seed creates a solo user that is admin-equivalent", async () => {
    const solo = await db.selectFrom("users").selectAll().where("role", "=", "solo").executeTakeFirst();
    expect(solo).toBeDefined();
    expect(solo?.username).toBe("demo");
    expect(solo?.role).toBe("solo");
  });

  test("authenticate() in solo mode returns admin-equivalent context", async () => {
    resetSoloUserCache();
    const req = new Request("http://localhost/api/chats");
    const res = await authenticate({ request: req, database: db, authConfig: soloAuthConfig });
    expect("context" in res).toBe(true);
    if (!("context" in res)) throw new Error("expected context");
    expect(res.context.userRole).toBe("solo");
    expect(res.context.userId).toBeDefined();
    // solo == admin-equivalent in this codebase
    expect(res.context.userRole === "admin" || res.context.userRole === "solo").toBe(true);
  });

  test("solo user gets an actor after first auth (FK-safe chat creation)", async () => {
    resetSoloUserCache();
    const req = new Request("http://localhost/api/chats");
    const res = await authenticate({ request: req, database: db, authConfig: soloAuthConfig });
    if (!("context" in res)) throw new Error("expected context");
    const actor = await db
      .selectFrom("actors")
      .select("id")
      .where("id", "=", res.context.userId!)
      .executeTakeFirst();
    expect(actor).toBeDefined();
  });

  test("no separate UserRole.Admin row is seeded (solo is the admin-equivalent)", async () => {
    const admin = await db.selectFrom("users").selectAll().where("role", "=", "admin").executeTakeFirst();
    expect(admin).toBeUndefined();
  });
});
