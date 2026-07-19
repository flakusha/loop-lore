import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import type { DB, } from "./schema";
import { seedDefaultActors, } from "./seed";

function multiUserConfig(overrides: Partial<Config["auth"]> = {},): Config {
  return {
    auth: {
      required: true,
      registrationOpen: true,
      sessionTimeoutHours: 24,
      maxSessionsPerUser: 10,
      demoUsername: "demo",
      demoAutoSetup: true,
      adminUsername: "",
      adminPassword: "",
      ...overrides,
    },
  } as unknown as Config;
}

describe("seedBootstrapAdmin (multi-user mode)", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("creates admin from config credentials with hashed password + actor", async () => {
    await seedDefaultActors(db, multiUserConfig({ adminUsername: "admin", adminPassword: "sup3rsecret", },),);

    const admin = await db.selectFrom("users",).selectAll().where("role", "=", "admin",).executeTakeFirst();
    expect(admin,).toBeDefined();
    expect(admin?.username,).toBe("admin",);
    expect(admin?.status,).toBe("active",);
    // password must be hashed, not plaintext
    expect(admin?.password_hash,).toBeDefined();
    expect(admin?.password_hash,).not.toBe("sup3rsecret",);
    expect(await Bun.password.verify("sup3rsecret", admin!.password_hash!,),).toBe(true,);

    // actor row exists so admin can own chats/entities
    const actor = await db.selectFrom("actors",).select("id",).where("id", "=", admin!.id,).executeTakeFirst();
    expect(actor,).toBeDefined();

    // no demo solo user in multi-user mode
    const solo = await db.selectFrom("users",).select("id",).where("role", "=", "solo",).executeTakeFirst();
    expect(solo,).toBeUndefined();
  });

  test("is idempotent — second seed does not duplicate admin", async () => {
    await seedDefaultActors(db, multiUserConfig({ adminUsername: "admin", adminPassword: "sup3rsecret", },),);

    const admins = await db
      .selectFrom("users",)
      .select((eb,) => eb.fn.countAll<number>().as("n",))
      .where("role", "=", "admin",)
      .executeTakeFirst();
    expect(admins?.n,).toBe(1,);
  });

  test("warns and creates no admin when credentials missing (required=true)", async () => {
    const db2 = (await createTestDb()).db;
    await seedDefaultActors(db2, multiUserConfig(),); // no adminUsername/adminPassword

    const admin = await db2.selectFrom("users",).select("id",).where("role", "=", "admin",).executeTakeFirst();
    expect(admin,).toBeUndefined();
    await db2.destroy();
  });

  test("solo mode never creates an admin even if adminUsername is set", async () => {
    const db2 = (await createTestDb()).db;
    await seedDefaultActors(
      db2,
      multiUserConfig({ required: false, adminUsername: "admin", adminPassword: "x", },),
    );

    const admin = await db2.selectFrom("users",).select("id",).where("role", "=", "admin",).executeTakeFirst();
    expect(admin,).toBeUndefined();

    const solo = await db2.selectFrom("users",).select("id",).where("role", "=", "solo",).executeTakeFirst();
    expect(solo,).toBeDefined();
    await db2.destroy();
  });
});
