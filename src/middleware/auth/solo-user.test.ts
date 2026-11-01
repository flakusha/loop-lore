import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { UserRole, UserStatus, } from "../../db/enums";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { getOrCreateSoloUserForAuth, resetSoloUserCache, } from "./solo-user";

let fixture: TestDb;
let db: TestDb["db"];

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  resetSoloUserCache();
},);

afterEach(async () => {
  resetSoloUserCache();
  await destroyTestDb(fixture,);
},);

async function countUsers(): Promise<number> {
  const rows = await db.selectFrom("users",).select("id",).execute();
  return rows.length;
}

describe("getOrCreateSoloUserForAuth", () => {
  test("creates the solo user and a matching actor on first run", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(solo,).not.toBeNull();

    const user = await db.selectFrom("users",)
      .where("id", "=", solo!.id,)
      .selectAll()
      .executeTakeFirstOrThrow();

    expect(user.username,).toBe("demo",);
    expect(user.role,).toBe(UserRole.Solo,);
    expect(user.status,).toBe(UserStatus.Active,);

    const actor = await db.selectFrom("actors",)
      .where("id", "=", solo!.id,)
      .selectAll()
      .executeTakeFirstOrThrow();

    expect(actor.user_id,).toBe(solo!.id,);
    expect(actor.owner_id,).toBe(solo!.id,);

    // Second lookup resolves to the same identity without duplicating rows.
    expect(await getOrCreateSoloUserForAuth(db, "demo",),).toEqual({ id: solo!.id, },);
    expect(await countUsers(),).toBe(1,);
  });

  test("reuses an existing solo-role user without creating a new one", async () => {
    await insertUsers(db, "seeded-solo", "Seeded Solo", { id: "solo-seed", role: UserRole.Solo, },);

    const solo = await getOrCreateSoloUserForAuth(db, "demo",);

    expect(solo,).toEqual({ id: "solo-seed", },);
    expect(await countUsers(),).toBe(1,);
  });

  test("adopts the demo-username user when no solo role exists", async () => {
    // Precedence: solo-role scan misses → username match wins over creation.
    await insertUsers(db, "demo", "Demo", { id: "demo-1", },);

    const solo = await getOrCreateSoloUserForAuth(db, "demo",);

    expect(solo,).toEqual({ id: "demo-1", },);
    expect(await countUsers(),).toBe(1,);
  });

  // BUG.2 regression: the cache is keyed per DB instance so two servers
  // sharing one process never leak a solo id across databases.
  test("cache is scoped per DB instance", async () => {
    const other = await createTestDb();
    try {
      const a = await getOrCreateSoloUserForAuth(db, "demo",);
      const b = await getOrCreateSoloUserForAuth(other.db, "demo",);

      // Separate in-memory DBs → separately created solo users.
      expect(b?.id,).not.toBeNull();
      expect(b?.id,).not.toBe(a?.id,);

      // The first instance still serves its cached identity.
      expect(await getOrCreateSoloUserForAuth(db, "demo",),).toEqual(a,);
    } finally {
      await destroyTestDb(other,);
    }
  });

  test("resetSoloUserCache forces re-resolution from the same DB row", async () => {
    const first = await getOrCreateSoloUserForAuth(db, "demo",);
    resetSoloUserCache();

    const second = await getOrCreateSoloUserForAuth(db, "demo",);

    expect(second,).toEqual(first,);
    expect(await countUsers(),).toBe(1,);
  });

  test("provisions the actor for a pre-seeded solo user that lacks one", async () => {
    // src/db/seed.ts creates the user but not its actor; chat creation needs
    // actors.id to exist (FOREIGN KEY constraint).
    await insertUsers(db, "seeded-solo", "Seeded Solo", { id: "solo-noactor", role: UserRole.Solo, },);

    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(solo,).toEqual({ id: "solo-noactor", },);

    const actor = await db.selectFrom("actors",)
      .where("id", "=", "solo-noactor",)
      .selectAll()
      .executeTakeFirstOrThrow();

    expect(actor.user_id,).toBe("solo-noactor",);
  });
});
